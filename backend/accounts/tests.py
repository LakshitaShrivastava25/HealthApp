from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts import services
from accounts.models import Account, OTPConfig

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


@override_settings(USE_TWOFACTOR=True, TWOFACTOR_API_KEY='', OTP_DEFAULT_MODE='sms')
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


TWILIO_SETTINGS = dict(
    USE_TWOFACTOR=False,
    TWILIO_ACCOUNT_SID='ACtest', TWILIO_AUTH_TOKEN='token',
    TWILIO_API_KEY_SID='', TWILIO_API_KEY_SECRET='',
    TWILIO_VERIFY_SERVICE_SID='VAtest',
)


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
        with mock.patch.object(services, '_twilio_verify_post', return_value=(400, {'code': 60200, 'message': 'Invalid parameter'})):
            r = self._send()
        self.assertEqual(r.status_code, 502)
        self.assertFalse(services.OTPRequest.objects.exists())

    def test_verify_without_send_never_calls_twilio(self):
        with mock.patch.object(services, '_twilio_verify_post') as post:
            self.assertEqual(self._verify('123456').status_code, 400)
        post.assert_not_called()

    def test_expired_verification_rejected(self):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'})):
            self._send()
        with mock.patch.object(services, '_twilio_verify_post', return_value=(404, {'code': 20404})):
            self.assertEqual(self._verify('123456').status_code, 400)

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
