"""
USE_TWILIO / USE_TWOFACTOR both false = no SMS gateway = master OTP on its own.
"""
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import services
from .models import Account

PHONE = '+919811122233'
TWILIO_KEYS = dict(
    TWILIO_ACCOUNT_SID='ACtest', TWILIO_AUTH_TOKEN='token',
    TWILIO_API_KEY_SID='', TWILIO_API_KEY_SECRET='', TWILIO_VERIFY_SERVICE_SID='VAtest',
)
SMS_OFF = dict(USE_TWILIO=False, USE_TWOFACTOR=False, DEBUG=False, **TWILIO_KEYS)


class SmsSwitchedOffTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    @override_settings(**SMS_OFF, USE_MASTER_OTP=None, MASTER_OTP='246810')
    def test_both_off_means_master_otp_and_no_sms(self):
        with mock.patch.object(services, '_twilio_verify_post') as twilio, \
                mock.patch.object(services, '_send_via_2factor') as twofactor:
            self.assertEqual(services.request_otp(PHONE), {'ok': True})
            twilio.assert_not_called()
            twofactor.assert_not_called()
        self.assertEqual(services.verify_otp(PHONE, '246810'), services.VERIFY_OK)
        self.assertNotEqual(services.verify_otp(PHONE, '111111'), services.VERIFY_OK)

    @override_settings(**SMS_OFF, USE_MASTER_OTP=None, MASTER_OTP='246810')
    def test_full_api_sign_in_with_master_code(self):
        api = APIClient()
        self.assertEqual(api.post('/api/auth/send-otp/', {'phone_number': PHONE}, format='json').status_code, 200)
        response = api.post('/api/auth/verify-otp/', {'phone_number': PHONE, 'otp': '246810'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)

    @override_settings(**SMS_OFF, USE_MASTER_OTP=False, MASTER_OTP='246810')
    def test_explicit_use_master_otp_false_still_wins(self):
        # Explicitly "no master" and no gateway: nothing can deliver a code.
        with mock.patch.object(services, '_twilio_verify_post') as twilio:
            result = services.request_otp(PHONE)
            twilio.assert_not_called()
        self.assertFalse(result['ok'])
        self.assertEqual(result['status'], 502)

    @override_settings(**SMS_OFF, USE_MASTER_OTP=None, MASTER_OTP='')
    def test_published_default_code_is_still_refused(self):
        # No MASTER_OTP set -> the admin-portal default 555555, which is public.
        result = services.request_otp(PHONE)
        self.assertFalse(result['ok'])
        self.assertNotEqual(services.verify_otp(PHONE, '555555'), services.VERIFY_OK)

    @override_settings(**SMS_OFF, USE_MASTER_OTP=None, MASTER_OTP='246810')
    def test_staff_never_use_the_master_code(self):
        Account.objects.create_user(PHONE, role=Account.Role.ADMIN)
        self.assertFalse(services.master_otp_for(PHONE)[0])
        self.assertFalse(services.request_otp(PHONE)['ok'])

    @override_settings(USE_TWILIO=True, USE_TWOFACTOR=False, DEBUG=False, USE_MASTER_OTP=None, MASTER_OTP='',
                       **TWILIO_KEYS)
    def test_default_twilio_on_still_sends_sms(self):
        with mock.patch.object(services, '_twilio_verify_post', return_value=(201, {'status': 'pending'})) as twilio:
            self.assertEqual(services.request_otp(PHONE), {'ok': True})
            twilio.assert_called_once()

    @override_settings(USE_TWILIO=False, USE_TWOFACTOR=True, TWOFACTOR_API_KEY='k', DEBUG=False,
                       USE_MASTER_OTP=None, MASTER_OTP='246810', **TWILIO_KEYS)
    def test_twilio_off_but_twofactor_on_uses_twofactor(self):
        with mock.patch.object(services, '_twilio_verify_post') as twilio, \
                mock.patch.object(services, '_send_via_2factor', return_value=(True, 'sid')) as twofactor:
            self.assertTrue(services.request_otp(PHONE)['ok'])
            twofactor.assert_called_once()
            twilio.assert_not_called()


@override_settings(**SMS_OFF, USE_MASTER_OTP=None, MASTER_OTP='246810', ADMIN_PHONE_NUMBERS=['+919811199999'])
class AdminOtpSettingsWhenSmsOffTests(TestCase):
    def setUp(self):
        self.admin = Account.objects.create_user('+919811199999', role=Account.Role.ADMIN)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def test_reports_master_mode_locked_and_no_provider(self):
        data = self.api.get('/api/admin/otp-settings/').data
        self.assertEqual(data['mode'], 'master')
        self.assertTrue(data['mode_locked_by_env'])
        self.assertEqual(data['sms_provider'], 'none')
        self.assertFalse(data['sms_configured'])

    def test_switch_refuses_to_pretend(self):
        response = self.api.patch('/api/admin/otp-settings/', {'mode': 'sms'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertIn('USE_TWILIO', response.data['detail'])
