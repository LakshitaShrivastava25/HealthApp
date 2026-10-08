from datetime import timedelta
from unittest import mock

from django.db.models import F
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import services
from accounts.models import Account, OTPConfig
from admin_portal.models import AuditLog

PHONE = '+919876500001'


@override_settings(USE_TWOFACTOR=True, TWOFACTOR_API_KEY='')
class MasterOTPTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _verify(self, otp):
        return self.client.post('/api/auth/verify-otp/', {'phone_number': PHONE, 'otp': otp}, format='json')

    def test_master_mode_accepts_master_code_and_sends_nothing(self):
        OTPConfig.objects.create(mode=OTPConfig.Mode.MASTER)
        with mock.patch.object(services, '_send_via_2factor') as sender:
            r = self.client.post('/api/auth/send-otp/', {'phone_number': PHONE}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('debug_otp', r.data)
        self.assertNotIn('555555', str(r.data))
        sender.assert_not_called()
        self.assertEqual(self._verify('111111').status_code, 400)
        r = self._verify('555555')
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)

    def test_sms_mode_rejects_master_code(self):
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        self.client.post('/api/auth/send-otp/', {'phone_number': PHONE}, format='json')
        self.assertEqual(self._verify('555555').status_code, 400)

    @override_settings(DEBUG=True)
    def test_sms_mode_real_otp_still_works(self):
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        r = self.client.post('/api/auth/send-otp/', {'phone_number': PHONE}, format='json')
        self.assertEqual(self._verify(r.data['debug_otp']).status_code, 200)

    @override_settings(TWOFACTOR_API_KEY='k')
    def test_sms_failure_returns_502(self):
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        with mock.patch.object(services, '_send_via_2factor', return_value=(False, 'Invalid template')):
            r = self.client.post('/api/auth/send-otp/', {'phone_number': PHONE}, format='json')
        self.assertEqual(r.status_code, 502)

    @override_settings(OTP_DEFAULT_MODE='master')
    def test_default_mode_from_settings(self):
        self.assertEqual(OTPConfig.load().mode, OTPConfig.Mode.MASTER)


@override_settings(USE_TWOFACTOR=True, TWOFACTOR_API_KEY='', OTP_DEFAULT_MODE='sms', USE_MASTER_OTP=None, MASTER_OTP='')
@override_settings(ADMIN_PHONE_NUMBERS=['+919000000001'])
class OTPSettingsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = Account.objects.create_user('+919000000001', role=Account.Role.ADMIN)
        self.patient = Account.objects.create_user('+919000000002')

    def test_patient_forbidden(self):
        self.client.force_authenticate(self.patient)
        self.assertEqual(self.client.get('/api/admin/otp-settings/').status_code, 403)
        self.assertEqual(self.client.patch('/api/admin/otp-settings/', {'mode': 'master'}, format='json').status_code, 403)

    def test_admin_switches_mode(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get('/api/admin/otp-settings/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['mode'], 'sms')
        self.assertFalse(r.data['sms_configured'])
        r = self.client.patch('/api/admin/otp-settings/', {'mode': 'master', 'master_otp': '123456'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(OTPConfig.load().mode, 'master')
        self.assertEqual(OTPConfig.load().master_otp, '123456')
        self.assertEqual(self.client.patch('/api/admin/otp-settings/', {'mode': 'x'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/admin/otp-settings/', {'master_otp': '12a'}, format='json').status_code, 400)

    def test_test_sms_without_key(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post('/api/admin/otp-settings/', {'test_phone': '+919876543210'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['ok'])

    def test_env_flags_off_unlock_settings(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get('/api/admin/otp-settings/')
        self.assertFalse(r.data['mode_locked_by_env'])
        self.assertFalse(r.data['master_otp_locked_by_env'])

    @override_settings(USE_MASTER_OTP=True, MASTER_OTP='424242')
    def test_mode_change_rejected_while_env_locks_it(self):
        self.client.force_authenticate(self.admin)
        r = self.client.patch('/api/admin/otp-settings/', {'mode': 'sms'}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertIn('USE_MASTER_OTP', r.data['detail'])
        self.assertEqual(OTPConfig.load().mode, 'sms')
        self.assertFalse(AuditLog.objects.exists())
        # The master code can still be edited; the env one wins and is reported.
        r = self.client.patch('/api/admin/otp-settings/', {'master_otp': '123456'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(OTPConfig.load().master_otp, '123456')
        self.assertEqual(r.data['mode'], 'master')
        self.assertEqual(r.data['master_otp'], '424242')
        self.assertTrue(r.data['mode_locked_by_env'])
        self.assertTrue(r.data['master_otp_locked_by_env'])

    @override_settings(USE_MASTER_OTP=False)
    def test_env_false_also_locks_mode(self):
        self.client.force_authenticate(self.admin)
        r = self.client.patch('/api/admin/otp-settings/', {'mode': 'master'}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(OTPConfig.load().mode, 'sms')

    def test_twofactor_dlt_hint_kept(self):
        self.client.force_authenticate(self.admin)
        with mock.patch.object(services, 'send_test_sms', return_value=(True, 'sid', 'DLT-CNT-REJECT')):
            r = self.client.post('/api/admin/otp-settings/', {'test_phone': '+919876543210'}, format='json')
        self.assertIn('DLT', r.data['hint'])
        self.assertEqual(r.data['delivery_status'], 'DLT-CNT-REJECT')


TWILIO_SETTINGS = dict(
    USE_TWOFACTOR=False,
    TWILIO_ACCOUNT_SID='ACtest', TWILIO_AUTH_TOKEN='token',
    TWILIO_API_KEY_SID='', TWILIO_API_KEY_SECRET='',
    TWILIO_VERIFY_SERVICE_SID='VAtest',
)


@override_settings(**TWILIO_SETTINGS, USE_MASTER_OTP=None, MASTER_OTP='')
@override_settings(ADMIN_PHONE_NUMBERS=['+919000000001'])
class TwilioTestSMSHintTests(TestCase):
    """POST /api/admin/otp-settings/ turns common Twilio Verify errors into a hint."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(Account.objects.create_user('+919000000001', role=Account.Role.ADMIN))

    def _test_sms(self, status, body):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(status, body)):
            return self.client.post('/api/admin/otp-settings/', {'test_phone': '+919876543210'}, format='json')

    def test_known_errors_get_hints(self):
        cases = [
            ({'code': 60200, 'message': 'Invalid parameter `To`: +91987654321'}, 'international format'),
            ({'code': 60203, 'message': 'Max send attempts reached'}, 'Wait about 10 minutes'),
            ({'code': 60205, 'message': 'SMS is not supported by landline phone number'}, 'landline'),
            ({'code': 60410, 'message': 'Verification delivery attempt blocked'}, 'Geo permissions'),
            ({'code': 60605, 'message': 'Verification delivery attempt blocked'}, 'Geo permissions'),
        ]
        for body, expected in cases:
            with self.subTest(code=body['code']):
                r = self._test_sms(400, body)
                self.assertFalse(r.data['ok'])
                self.assertIn(expected, r.data['hint'])
        r = self._test_sms(401, {'code': 20003, 'message': 'Authenticate'})
        self.assertIn('TWILIO_AUTH_TOKEN', r.data['hint'])

    def test_success_and_unknown_error_have_no_hint(self):
        r = self._test_sms(201, {'status': 'pending'})
        self.assertTrue(r.data['ok'])
        self.assertEqual(r.data['details'], 'pending')
        self.assertEqual(r.data['delivery_status'], 'pending')
        self.assertEqual(r.data['hint'], '')
        r = self._test_sms(500, {'code': 20500, 'message': 'Internal Server Error'})
        self.assertFalse(r.data['ok'])
        self.assertEqual(r.data['hint'], '')

    def test_payload_reports_twilio(self):
        r = self.client.get('/api/admin/otp-settings/')
        self.assertEqual(r.data['sms_provider'], 'twilio')
        self.assertTrue(r.data['sms_configured'])
        self.assertIsNone(r.data['sms_balance'])


@override_settings(**TWILIO_SETTINGS)
class TwilioOTPTests(TestCase):
    """USE_TWOFACTOR=false routes OTPs through Twilio Verify (mocked here)."""

    def setUp(self):
        self.client = APIClient()
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)

    def _send(self):
        return self.client.post('/api/auth/send-otp/', {'phone_number': PHONE}, format='json')

    def _verify(self, otp):
        return self.client.post('/api/auth/verify-otp/', {'phone_number': PHONE, 'otp': otp}, format='json')

    def test_send_and_verify_through_twilio(self):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'})) as post, \
                mock.patch.object(services, '_send_via_2factor') as twofactor:
            r = self._send()
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('debug_otp', r.data)
        post.assert_called_once_with('Verifications', {'To': PHONE, 'Channel': 'sms'})
        twofactor.assert_not_called()

        with mock.patch.object(services, '_twilio_verify_post', return_value=(200, {'status': 'pending'})):
            self.assertEqual(self._verify('000000').status_code, 400)
        with mock.patch.object(services, '_twilio_verify_post', return_value=(200, {'status': 'approved'})) as post:
            r = self._verify('123456')
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)
        post.assert_called_once_with('VerificationCheck', {'To': PHONE, 'Code': '123456'})

    def test_twilio_send_failure_returns_502_and_frees_quota(self):
        for status, body in ((429, {'code': 60203, 'message': 'Max send attempts reached'}),
                             (500, {'code': 20500, 'message': 'Internal Server Error'}),
                             (0, {'message': 'Could not reach Twilio (URLError)'})):
            with self.subTest(status=status), mock.patch.object(services, '_twilio_verify_post', return_value=(status, body)):
                r = self._send()
                self.assertEqual(r.status_code, 502)
                self.assertEqual(r.data, {'detail': "Couldn't send the OTP SMS. Please try again."})
        self.assertFalse(services.OTPRequest.objects.exists())

    def test_twilio_bad_number_returns_400_and_frees_quota(self):
        for code in (60200, 60205, 21211, 21614):
            with self.subTest(code=code), \
                    mock.patch.object(services, '_twilio_verify_post', return_value=(400, {'code': code, 'message': 'x'})):
                r = self._send()
                self.assertEqual(r.status_code, 400)
                self.assertEqual(r.data, {'detail': 'Check the mobile number and try again.'})
        self.assertFalse(services.OTPRequest.objects.exists())

    def test_verify_without_send_never_calls_twilio(self):
        with mock.patch.object(services, '_twilio_verify_post') as post:
            r = self._verify('123456')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['detail'], 'This code has expired. Tap Resend to get a new one.')
        post.assert_not_called()

    def test_expired_verification_rejected(self):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'})):
            self._send()
        with mock.patch.object(services, '_twilio_verify_post', return_value=(404, {'code': 20404})):
            r = self._verify('123456')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['detail'], 'This code has expired. Tap Resend to get a new one.')

    def test_master_mode_still_overrides_twilio(self):
        OTPConfig.objects.update(mode=OTPConfig.Mode.MASTER)
        with mock.patch.object(services, '_twilio_verify_post') as post:
            self.assertEqual(self._send().status_code, 200)
            self.assertEqual(self._verify('555555').status_code, 200)
        post.assert_not_called()

    @override_settings(TWILIO_API_KEY_SID='SKkey', TWILIO_API_KEY_SECRET='secret')
    def test_api_key_wins_over_auth_token(self):
        self.assertEqual(services._twilio_credentials(), ('SKkey', 'secret'))

    @override_settings(TWILIO_VERIFY_SERVICE_SID='')
    def test_unconfigured_twilio_falls_back_to_dev_otp(self):
        with override_settings(DEBUG=True), mock.patch.object(services, '_twilio_verify_post') as post:
            r = self._send()
            self.assertEqual(self._verify(r.data['debug_otp']).status_code, 200)
        post.assert_not_called()

    @override_settings(USE_TWOFACTOR=True, TWOFACTOR_API_KEY='k')
    def test_toggle_true_uses_twofactor(self):
        with mock.patch.object(services, '_send_via_2factor', return_value=(True, 'sid')) as twofactor, \
                mock.patch.object(services, '_twilio_verify_post') as post:
            self.assertEqual(self._send().status_code, 200)
        twofactor.assert_called_once()
        post.assert_not_called()


@override_settings(**TWILIO_SETTINGS)
class OTPEnvSwitchTests(TestCase):
    """USE_MASTER_OTP / USE_TWOFACTOR pick the gateway: master > Twilio > 2Factor."""

    PHONE = '+919876543210'

    @override_settings(USE_MASTER_OTP=True, MASTER_OTP='424242')
    def test_master_on_sends_nothing_and_accepts_master_code(self):
        with mock.patch('accounts.services._twilio_verify_post') as post:
            self.assertTrue(services.request_otp(self.PHONE)['ok'])
            post.assert_not_called()
        self.assertEqual(services.verify_otp(self.PHONE, '424242'), services.VERIFY_OK)
        self.assertEqual(services.verify_otp(self.PHONE, '555555'), services.VERIFY_WRONG)

    @override_settings(USE_MASTER_OTP=False, MASTER_OTP='424242')
    def test_master_off_twofactor_off_uses_twilio_not_master_code(self):
        with mock.patch('accounts.services._twilio_verify_post', return_value=(201, {'status': 'pending'})) as post:
            self.assertTrue(services.request_otp(self.PHONE)['ok'])
            post.assert_called_once()
        with mock.patch('accounts.services._twilio_verify_post', return_value=(200, {'status': 'approved'})):
            self.assertEqual(services.verify_otp(self.PHONE, '123456'), services.VERIFY_OK)
        self.assertNotEqual(services.verify_otp(self.PHONE, '424242'), services.VERIFY_OK)

    @override_settings(USE_MASTER_OTP=False, USE_TWOFACTOR=True, TWOFACTOR_API_KEY='k')
    def test_master_off_twofactor_on_uses_2factor(self):
        with mock.patch('accounts.services._twilio_verify_post') as twilio, \
                mock.patch('accounts.services._send_via_2factor', return_value=(True, 'sid')) as tf:
            self.assertTrue(services.request_otp(self.PHONE)['ok'])
            tf.assert_called_once()
            twilio.assert_not_called()


WRONG = "That code isn't right. Check it and try again."
EXPIRED = 'This code has expired. Tap Resend to get a new one.'
LOCKED = 'Too many wrong attempts. Tap Resend to get a new code.'
UNAVAILABLE = "Couldn't check the code right now. Please try again."


def _skip_cooldown():
    """Back-date every OTPRequest past the resend cooldown instead of sleeping."""
    services.OTPRequest.objects.update(
        created_at=F('created_at') - timedelta(seconds=services.OTP_RESEND_COOLDOWN_SECONDS)
    )


class OTPAPIMixin:
    def _send(self, phone=PHONE):
        return self.client.post('/api/auth/send-otp/', {'phone_number': phone}, format='json')

    def _verify(self, otp):
        return self.client.post('/api/auth/verify-otp/', {'phone_number': PHONE, 'otp': otp}, format='json')

    def _assert_error(self, r, status, detail):
        self.assertEqual(r.status_code, status)
        self.assertEqual(r.data, {'detail': detail})


@override_settings(**TWILIO_SETTINGS, USE_MASTER_OTP=None, MASTER_OTP='')
class SendOTPErrorTests(OTPAPIMixin, TestCase):
    """send-otp error contract: bad number 400, hourly limit 429, gateway/config 502."""

    def setUp(self):
        self.client = APIClient()
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)

    def test_non_e164_phone_rejected_before_any_send(self):
        for phone in ('9876543210', '919876543210', '+0123456789', '+91 98765 43210', '+12345', 'abc', '',
                      '+123456789012345'):  # 15 digits: too long for the 15-char column with its '+'
            with self.subTest(phone=phone), mock.patch.object(services, '_twilio_verify_post') as post:
                self._assert_error(self._send(phone), 400, 'Enter a valid mobile number.')
                post.assert_not_called()
        self.assertFalse(services.OTPRequest.objects.exists())

    def test_hourly_limit_returns_429(self):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'})) as post:
            for _ in range(services.OTP_RATE_LIMIT_PER_HOUR):
                self.assertEqual(self._send().status_code, 200)
                _skip_cooldown()
            r = self._send()
        self._assert_error(r, 429, 'Too many OTP requests. Try again later.')
        self.assertEqual(post.call_count, services.OTP_RATE_LIMIT_PER_HOUR)

    def test_longest_e164_number_accepted(self):
        phone = '+12345678901234'  # 14 digits + '+' = 15 chars, the column's max
        with mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'})) as post:
            self.assertEqual(self._send(phone).status_code, 200)
        post.assert_called_once_with('Verifications', {'To': phone, 'Channel': 'sms'})

    @override_settings(TWILIO_VERIFY_SERVICE_SID='', DEBUG=False)
    def test_unconfigured_twilio_in_production_returns_502(self):
        with self.assertLogs('accounts.services', level='ERROR') as logs, \
                mock.patch.object(services, '_twilio_verify_post') as post:
            r = self._send()
        self._assert_error(r, 502, "Couldn't send the OTP SMS. Please try again.")
        post.assert_not_called()
        self.assertFalse(services.OTPRequest.objects.exists())
        log = '\n'.join(logs.output)
        self.assertIn('TWILIO_VERIFY_SERVICE_SID', log)
        self.assertNotIn('ACtest', log)  # names only, never values

    @override_settings(TWILIO_ACCOUNT_SID='', TWILIO_AUTH_TOKEN='', DEBUG=False)
    def test_missing_twilio_credentials_named_in_log(self):
        with self.assertLogs('accounts.services', level='ERROR') as logs:
            self.assertEqual(self._send().status_code, 502)
        log = '\n'.join(logs.output)
        self.assertIn('TWILIO_AUTH_TOKEN', log)
        self.assertNotIn('VAtest', log)

    @override_settings(USE_TWOFACTOR=True, TWOFACTOR_API_KEY='', DEBUG=False)
    def test_unconfigured_twofactor_in_production_returns_502(self):
        with self.assertLogs('accounts.services', level='ERROR') as logs, \
                mock.patch.object(services, '_send_via_2factor') as twofactor:
            self.assertEqual(self._send().status_code, 502)
        twofactor.assert_not_called()
        self.assertIn('TWOFACTOR_API_KEY', '\n'.join(logs.output))

    @override_settings(TWILIO_VERIFY_SERVICE_SID='', DEBUG=False)
    def test_master_mode_needs_no_gateway(self):
        OTPConfig.objects.update(mode=OTPConfig.Mode.MASTER)
        self.assertEqual(self._send().status_code, 200)
        self.assertEqual(self._verify('555555').status_code, 200)

    def test_twilio_error_code_in_details(self):
        with mock.patch.object(services, '_twilio_verify_post',
                               return_value=(400, {'code': 60200, 'message': 'Invalid parameter `To`'})):
            self.assertEqual(services._send_via_twilio(PHONE),
                             (False, 'HTTP 400 (60200): Invalid parameter `To`', 60200))
        with mock.patch.object(services, '_twilio_verify_post', return_value=(0, {'message': 'Could not reach Twilio'})):
            self.assertEqual(services._send_via_twilio(PHONE), (False, 'HTTP 0: Could not reach Twilio', None))


@override_settings(**TWILIO_SETTINGS, USE_MASTER_OTP=None, MASTER_OTP='')
class TwilioVerifyErrorTests(OTPAPIMixin, TestCase):
    """verify-otp through Twilio: wrong / expired / locked / unavailable."""

    def setUp(self):
        self.client = APIClient()
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        with mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'})):
            self.assertEqual(self._send().status_code, 200)

    def _check(self, status, body, otp='123456'):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(status, body)) as post:
            r = self._verify(otp)
        return r, post

    def _attempts(self):
        return services.OTPRequest.objects.get().attempt_count

    def test_wrong_code(self):
        r, _ = self._check(200, {'status': 'pending'})
        self._assert_error(r, 400, WRONG)
        self.assertEqual(self._attempts(), 1)

    def test_malformed_code_rejected_by_twilio_is_wrong(self):
        r, _ = self._check(400, {'code': 60200, 'message': 'Invalid parameter: Code'})
        self._assert_error(r, 400, WRONG)

    def test_expired_at_twilio(self):
        r, _ = self._check(404, {'code': 20404})
        self._assert_error(r, 400, EXPIRED)
        r, _ = self._check(200, {'status': 'canceled'})
        self._assert_error(r, 400, EXPIRED)

    def test_expired_locally_skips_twilio(self):
        services.OTPRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        r, post = self._check(200, {'status': 'approved'})
        self._assert_error(r, 400, EXPIRED)
        post.assert_not_called()

    def test_locked_by_twilio(self):
        r, _ = self._check(429, {'code': 60202, 'message': 'Max check attempts reached'})
        self._assert_error(r, 429, LOCKED)
        r, _ = self._check(400, {'code': 60202})
        self._assert_error(r, 429, LOCKED)
        r, _ = self._check(200, {'status': 'max_attempts_reached'})
        self._assert_error(r, 429, LOCKED)

    def test_locked_locally_after_five_attempts(self):
        for _ in range(services.OTP_MAX_ATTEMPTS):
            r, _ = self._check(200, {'status': 'pending'})
            self._assert_error(r, 400, WRONG)
        r, post = self._check(200, {'status': 'approved'})
        self._assert_error(r, 429, LOCKED)
        post.assert_not_called()

    def test_unavailable_does_not_consume_attempt(self):
        for status, body in ((0, {'message': 'Could not reach Twilio (URLError)'}),
                             (500, {'code': 20500}), (503, {}), (401, {'code': 20003})):
            with self.subTest(status=status):
                r, post = self._check(status, body)
                self._assert_error(r, 502, UNAVAILABLE)
                post.assert_called_once()
                self.assertEqual(self._attempts(), 0)
        # The same code still works once Twilio is back.
        r, _ = self._check(200, {'status': 'approved'})
        self.assertEqual(r.status_code, 200)

    def test_master_mode_wrong_code(self):
        OTPConfig.objects.update(mode=OTPConfig.Mode.MASTER)
        r, post = self._check(200, {'status': 'approved'}, otp='111111')
        self._assert_error(r, 400, WRONG)
        post.assert_not_called()


@override_settings(**TWILIO_SETTINGS, USE_MASTER_OTP=None, MASTER_OTP='')
class TwilioResendTests(OTPAPIMixin, TestCase):
    """A resend inside Twilio's window keeps the first send's expiry and attempt count."""

    def setUp(self):
        self.client = APIClient()
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        patcher = mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'}))
        patcher.start()
        self.addCleanup(patcher.stop)

    def _rows(self):
        return list(services.OTPRequest.objects.order_by('created_at', 'id'))

    def _wrong(self):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(200, {'status': 'pending'})):
            self._assert_error(self._verify('000000'), 400, WRONG)

    def test_resend_carries_expiry_and_attempts(self):
        self._send()
        self._wrong()
        self._wrong()
        _skip_cooldown()
        self.assertEqual(self._send().status_code, 200)
        first, second = self._rows()
        self.assertEqual(second.expires_at, first.expires_at)
        self.assertEqual(second.attempt_count, 2)
        # Three more wrong checks reach Twilio's 5; the sixth is locked locally.
        for _ in range(3):
            self._wrong()
        with mock.patch.object(services, '_twilio_verify_post') as post:
            self._assert_error(self._verify('000000'), 429, LOCKED)
        post.assert_not_called()

    def test_resend_after_expiry_starts_fresh(self):
        self._send()
        self._wrong()
        services.OTPRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        _skip_cooldown()
        self._send()
        new = self._rows()[1]
        self.assertGreater(new.expires_at, timezone.now())
        self.assertEqual(new.attempt_count, 0)

    def test_resend_after_exhausted_row_starts_fresh(self):
        self._send()
        services.OTPRequest.objects.update(attempt_count=services.OTP_MAX_ATTEMPTS)
        _skip_cooldown()
        self._send()
        self.assertEqual(self._rows()[1].attempt_count, 0)

    def test_resend_after_used_code_starts_fresh(self):
        self._send()
        services.OTPRequest.objects.update(is_used=True, attempt_count=2)
        _skip_cooldown()
        self._send()
        self.assertEqual(self._rows()[1].attempt_count, 0)

    def test_failed_resend_keeps_live_row(self):
        self._send()
        _skip_cooldown()
        with mock.patch.object(services, '_twilio_verify_post', return_value=(500, {})):
            self.assertEqual(self._send().status_code, 502)
        self.assertEqual(len(self._rows()), 1)

    def test_rate_limit_counts_resends(self):
        for _ in range(services.OTP_RATE_LIMIT_PER_HOUR):
            self.assertEqual(self._send().status_code, 200)
            _skip_cooldown()
        self._assert_error(self._send(), 429, 'Too many OTP requests. Try again later.')


@override_settings(USE_TWOFACTOR=True, TWOFACTOR_API_KEY='k', USE_MASTER_OTP=None, MASTER_OTP='')
class TwoFactorVerifyTests(OTPAPIMixin, TestCase):
    """The 2Factor (local hash) path: wrong / expired / locked, fresh code per send."""

    def setUp(self):
        self.client = APIClient()
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        self.sent = []

        def fake_send(phone, otp):
            self.sent.append(otp)
            return True, 'sid'

        patcher = mock.patch.object(services, '_send_via_2factor', side_effect=fake_send)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.assertEqual(self._send().status_code, 200)

    def _wrong_code(self):
        return '000000' if self.sent[-1] != '000000' else '111111'

    def test_wrong_then_right(self):
        self._assert_error(self._verify(self._wrong_code()), 400, WRONG)
        self.assertEqual(self._verify(self.sent[-1]).status_code, 200)

    def test_expired(self):
        services.OTPRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self._assert_error(self._verify(self.sent[-1]), 400, EXPIRED)

    def test_locked_after_five_wrong(self):
        for _ in range(services.OTP_MAX_ATTEMPTS):
            self._assert_error(self._verify(self._wrong_code()), 400, WRONG)
        self._assert_error(self._verify(self.sent[-1]), 429, LOCKED)

    def test_resend_gets_fresh_expiry_and_attempts(self):
        self._verify(self._wrong_code())
        services.OTPRequest.objects.update(expires_at=timezone.now() + timedelta(minutes=1))
        _skip_cooldown()
        self._send()
        new = services.OTPRequest.objects.order_by('-created_at', '-id').first()
        self.assertEqual(new.attempt_count, 0)
        self.assertGreater(new.expires_at, timezone.now() + timedelta(minutes=services.OTP_TTL_MINUTES - 1))


@override_settings(**TWILIO_SETTINGS, USE_MASTER_OTP=None, MASTER_OTP='')
@override_settings(ADMIN_PHONE_NUMBERS=['+919000000001'])
class TwilioHintMatchingTests(TestCase):
    """Admin test-SMS hints match on Twilio's error code, not digits in the message."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(Account.objects.create_user('+919000000001', role=Account.Role.ADMIN))

    def _test_sms(self, status, body):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(status, body)):
            return self.client.post('/api/admin/otp-settings/', {'test_phone': '+919876543210'}, format='json').data

    def test_details_carry_code(self):
        data = self._test_sms(400, {'code': 60200, 'message': 'Invalid parameter `To`'})
        self.assertEqual(data['details'], 'HTTP 400 (60200): Invalid parameter `To`')

    def test_code_wins_over_message(self):
        self.assertIn('Wait about 10 minutes', self._test_sms(429, {'code': 60203, 'message': 'landline blocked'})['hint'])
        # Digits of a hinted code inside the message (e.g. a phone number) don't match.
        self.assertEqual(self._test_sms(400, {'code': 21608, 'message': 'Number +9160200 is unverified'})['hint'], '')

    def test_more_bad_number_codes(self):
        self.assertIn('international format', self._test_sms(400, {'code': 21211, 'message': 'x'})['hint'])
        self.assertIn('landline', self._test_sms(400, {'code': 21614, 'message': 'x'})['hint'])

    def test_message_fallback_without_code(self):
        self.assertIn('TWILIO_AUTH_TOKEN', self._test_sms(401, {})['hint'])
        self.assertIn('Geo permissions', self._test_sms(403, {'message': 'Delivery blocked'})['hint'])


@override_settings(**TWILIO_SETTINGS, USE_MASTER_OTP=None, MASTER_OTP='')
class VerifyInputTests(OTPAPIMixin, TestCase):
    """Malformed verify-otp input gets one {"detail"} and never touches the attempt count."""

    def setUp(self):
        self.client = APIClient()
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        with mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'})):
            self.assertEqual(self._send().status_code, 200)

    def _post(self, data):
        with mock.patch.object(services, '_twilio_verify_post') as post:
            r = self.client.post('/api/auth/verify-otp/', data, format='json')
        post.assert_not_called()
        return r

    def test_bad_otp(self):
        for otp in ('12345', '1234567', 'abcdef', '12 345', '', None):
            with self.subTest(otp=otp):
                data = {'phone_number': PHONE} if otp is None else {'phone_number': PHONE, 'otp': otp}
                self._assert_error(self._post(data), 400, 'Enter the 6-digit code we texted you.')
        self.assertEqual(services.OTPRequest.objects.get().attempt_count, 0)

    def test_bad_phone(self):
        for phone in ('9876543210', '+91 98765 43210', '+123456789012345', '', None):
            with self.subTest(phone=phone):
                data = {'otp': '123456'} if phone is None else {'phone_number': phone, 'otp': '123456'}
                self._assert_error(self._post(data), 400, 'Enter a valid mobile number.')
        # Both bad: the number is reported first.
        self._assert_error(self._post({'phone_number': 'x', 'otp': 'y'}), 400, 'Enter a valid mobile number.')
        self.assertEqual(services.OTPRequest.objects.get().attempt_count, 0)


@override_settings(**TWILIO_SETTINGS, USE_MASTER_OTP=None, MASTER_OTP='')
class ResendCooldownTests(OTPAPIMixin, TestCase):
    """One send per number per OTP_RESEND_COOLDOWN_SECONDS; 429 + retry_after otherwise."""

    def setUp(self):
        self.client = APIClient()
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        patcher = mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'}))
        self.post = patcher.start()
        self.addCleanup(patcher.stop)

    def _age_rows(self, seconds):
        services.OTPRequest.objects.update(created_at=timezone.now() - timedelta(seconds=seconds))

    def test_immediate_resend_is_429_with_retry_after(self):
        self.assertEqual(self._send().status_code, 200)
        r = self._send()
        self.assertEqual(r.status_code, 429)
        wait = r.data['retry_after']
        self.assertTrue(services.OTP_RESEND_COOLDOWN_SECONDS - 2 <= wait <= services.OTP_RESEND_COOLDOWN_SECONDS)
        self.assertEqual(r.data, {
            'detail': f'Please wait {wait} seconds before requesting another code.',
            'retry_after': wait,
        })
        self.assertEqual(r['Retry-After'], str(wait))
        # Nothing sent, no row created.
        self.assertEqual(self.post.call_count, 1)
        self.assertEqual(services.OTPRequest.objects.count(), 1)

    def test_retry_after_counts_down_and_is_at_least_one(self):
        self._send()
        self._age_rows(45)
        self.assertEqual(self._send().data['retry_after'], 15)
        self._age_rows(services.OTP_RESEND_COOLDOWN_SECONDS - 0.2)
        r = self._send()
        self.assertEqual(r.data['retry_after'], 1)
        self.assertEqual(r.data['detail'], 'Please wait 1 second before requesting another code.')

    def test_send_allowed_once_cooldown_has_passed(self):
        self._send()
        self._age_rows(services.OTP_RESEND_COOLDOWN_SECONDS)
        self.assertEqual(self._send().status_code, 200)
        self.assertEqual(self.post.call_count, 2)

    def test_cooldown_is_per_number(self):
        self._send()
        self.assertEqual(self._send('+919876500002').status_code, 200)

    def test_failed_send_starts_no_cooldown(self):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(500, {})):
            self.assertEqual(self._send().status_code, 502)
        self.assertEqual(self._send().status_code, 200)

    def test_master_mode_skips_cooldown(self):
        self._send()
        OTPConfig.objects.update(mode=OTPConfig.Mode.MASTER)
        self.assertEqual(self._send().status_code, 200)
        self.assertEqual(self._send().status_code, 200)
        self.assertEqual(self.post.call_count, 1)

    def test_hourly_limit_reported_before_cooldown(self):
        for _ in range(services.OTP_RATE_LIMIT_PER_HOUR):
            self._send()
            _skip_cooldown()
        # Make the newest row fall inside the cooldown as well.
        newest = services.OTPRequest.objects.order_by('-created_at', '-id').first()
        services.OTPRequest.objects.filter(pk=newest.pk).update(created_at=timezone.now())
        self._assert_error(self._send(), 429, 'Too many OTP requests. Try again later.')


REVIEWER = '+919999999999'


@override_settings(**TWILIO_SETTINGS, USE_MASTER_OTP=None, MASTER_OTP='',
                   REVIEWER_PHONE=REVIEWER, REVIEWER_OTP='123456')
class ReviewerLoginTests(TestCase):
    """The Google Play review number signs in with a fixed code and no SMS."""

    def setUp(self):
        self.client = APIClient()
        OTPConfig.objects.create(mode=OTPConfig.Mode.SMS)
        patcher = mock.patch.object(services, '_twilio_verify_post')
        self.twilio = patcher.start()
        self.addCleanup(patcher.stop)

    def _send(self, phone=REVIEWER):
        return self.client.post('/api/auth/send-otp/', {'phone_number': phone}, format='json')

    def _verify(self, otp, phone=REVIEWER):
        return self.client.post('/api/auth/verify-otp/', {'phone_number': phone, 'otp': otp}, format='json')

    def test_reviewer_signs_in_with_fixed_code_without_sms(self):
        r = self._send()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, {'ok': True})
        r = self._verify('123456')
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)
        self.twilio.assert_not_called()

    def test_wrong_code_and_attempt_limit_still_apply(self):
        self._send()
        self.assertEqual(self._verify('000000').status_code, 400)
        for _ in range(services.OTP_MAX_ATTEMPTS - 1):
            self._verify('000000')
        self.assertEqual(self._verify('123456').status_code, 429)

    def test_code_expires(self):
        self._send()
        services.OTPRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self._verify('123456').status_code, 400)

    def test_code_needs_a_send_first(self):
        self.assertEqual(self._verify('123456').status_code, 400)

    def test_other_numbers_still_use_twilio(self):
        self.twilio.return_value = (201, {'status': 'pending'})
        self.assertEqual(self._send(PHONE).status_code, 200)
        self.twilio.assert_called_once()
        self.twilio.return_value = (200, {'status': 'pending'})
        self.assertEqual(self._verify('123456', PHONE).status_code, 400)

    def test_deleted_reviewer_account_is_reactivated(self):
        Account.objects.create_user(REVIEWER, is_active=False)
        self._send()
        self.assertEqual(self._verify('123456').status_code, 200)
        self.assertTrue(Account.objects.get(phone_number=REVIEWER).is_active)

    @override_settings(REVIEWER_OTP='')
    def test_off_without_a_code(self):
        self.twilio.return_value = (201, {'status': 'pending'})
        self._send()
        self.twilio.assert_called_once()

    @override_settings(REVIEWER_OTP='12ab56')
    def test_malformed_code_is_ignored(self):
        self.assertEqual(services.reviewer_otp(REVIEWER), '')


ADMIN_PHONE = '+918962900701'
DASHBOARD_URL = '/api/admin/dashboard/summary/'


@override_settings(ADMIN_PHONE_NUMBERS=[ADMIN_PHONE], USE_MASTER_OTP=True, MASTER_OTP='424242')
class AdminAllowListTests(TestCase):
    """
    Only a number on ADMIN_PHONE_NUMBERS reaches the Admin Portal.

    Logs in through the master-OTP path the other tests in this file use,
    rather than asserting on a code the SMS gateway would have generated —
    verify_otp short-circuits to the master code, so no send is involved.
    """

    def setUp(self):
        self.client = APIClient()

    def _login(self, phone):
        return self.client.post(
            '/api/auth/verify-otp/', {'phone_number': phone, 'otp': '424242'}, format='json'
        )

    def _dashboard_as(self, access):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Bearer ' + access)
        return client.get(DASHBOARD_URL)

    def test_allow_listed_number_is_promoted_and_reaches_the_dashboard(self):
        response = self._login(ADMIN_PHONE)
        self.assertEqual(response.status_code, 200)

        account = Account.objects.get(phone_number=ADMIN_PHONE)
        self.assertEqual(account.role, Account.Role.ADMIN)
        self.assertTrue(account.is_staff)
        self.assertEqual(self._dashboard_as(response.data['access']).status_code, 200)

    def test_other_number_stays_a_patient_and_is_refused(self):
        response = self._login('+919111111111')
        self.assertEqual(response.status_code, 200)

        account = Account.objects.get(phone_number='+919111111111')
        self.assertEqual(account.role, Account.Role.PATIENT)
        self.assertEqual(self._dashboard_as(response.data['access']).status_code, 403)

    def test_admin_role_off_the_list_is_still_refused(self):
        """The allow list is the authority, not the role column: promoting an
        account in the database must not be enough on its own."""
        Account.objects.create_user('+919222222222', role=Account.Role.ADMIN)
        response = self._login('+919222222222')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._dashboard_as(response.data['access']).status_code, 403)
