from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts import services
from accounts.models import Account, OTPConfig

PHONE = '+919876500001'


@override_settings(TWOFACTOR_API_KEY='')
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


@override_settings(TWOFACTOR_API_KEY='', OTP_DEFAULT_MODE='sms')
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
