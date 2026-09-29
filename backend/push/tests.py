from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Account
from doctors.models import ConsultationNote, Doctor, DoctorPatientAccess
from family.models import Profile

from . import services
from .models import PushDevice

TOKEN_PATIENT = 'ExponentPushToken[patient-device]'
TOKEN_DOCTOR = 'ExponentPushToken[doctor-device]'


class _InlineThread:
    """Runs the push send on the calling thread so tests can assert on it."""

    def __init__(self, target, args=(), daemon=None):
        self._target, self._args = target, args

    def start(self):
        self._target(*self._args)


@mock.patch.object(services.threading, 'Thread', _InlineThread)
@mock.patch.object(services, '_post_batch')
class PushTriggerTests(TestCase):
    def setUp(self):
        self.patient = Account.objects.create_user('+919800000001')
        self.profile = Profile.objects.create(account=self.patient, full_name='Asha Rao')
        self.doctor_account = Account.objects.create_user('+919800000002')
        self.doctor = Doctor.objects.create(
            account=self.doctor_account,
            full_name='Mehta',
            specialization='Cardiology',
            verification_status=Doctor.VerificationStatus.VERIFIED,
        )
        PushDevice.objects.create(account=self.patient, token=TOKEN_PATIENT)
        PushDevice.objects.create(account=self.doctor_account, token=TOKEN_DOCTOR)

    def _sent(self, post_batch):
        return [m for call in post_batch.call_args_list for m in call.args[0]]

    def test_access_request_then_approval(self, post_batch):
        with self.captureOnCommitCallbacks(execute=True):
            grant = DoctorPatientAccess.objects.create(doctor=self.doctor, profile=self.profile)
        [msg] = self._sent(post_batch)
        self.assertEqual(msg['to'], TOKEN_PATIENT)
        self.assertIn('Dr. Mehta', msg['body'])
        self.assertEqual(msg['data']['url'], '/(patient)/doctor-access')

        post_batch.reset_mock()
        grant.status = DoctorPatientAccess.Status.APPROVED
        with self.captureOnCommitCallbacks(execute=True):
            grant.save()
        [msg] = self._sent(post_batch)
        self.assertEqual(msg['to'], TOKEN_DOCTOR)
        self.assertEqual(msg['data']['url'], f'/(doctor)/patient/{self.profile.id}')

    def test_resaving_without_status_change_sends_nothing(self, post_batch):
        grant = DoctorPatientAccess.objects.create(doctor=self.doctor, profile=self.profile)
        post_batch.reset_mock()
        with self.captureOnCommitCallbacks(execute=True):
            grant.save()
        post_batch.assert_not_called()

    def test_doctor_verification(self, post_batch):
        self.doctor.verification_status = Doctor.VerificationStatus.REJECTED
        with self.captureOnCommitCallbacks(execute=True):
            self.doctor.save()
        [msg] = self._sent(post_batch)
        self.assertEqual(msg['to'], TOKEN_DOCTOR)
        self.assertEqual(msg['title'], 'Verification update')

    def test_consultation_note(self, post_batch):
        with self.captureOnCommitCallbacks(execute=True):
            ConsultationNote.objects.create(doctor=self.doctor, profile=self.profile, diagnosis='Flu')
        [msg] = self._sent(post_batch)
        self.assertEqual(msg['to'], TOKEN_PATIENT)

    def test_inactive_device_is_skipped(self, post_batch):
        PushDevice.objects.filter(token=TOKEN_PATIENT).update(is_active=False)
        with self.captureOnCommitCallbacks(execute=True):
            ConsultationNote.objects.create(doctor=self.doctor, profile=self.profile)
        post_batch.assert_not_called()


class DeadTokenTests(TestCase):
    def test_device_not_registered_is_deactivated(self):
        account = Account.objects.create_user('+919800000003')
        PushDevice.objects.create(account=account, token=TOKEN_PATIENT)
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = (
            b'{"data":[{"status":"error","message":"gone","details":{"error":"DeviceNotRegistered"}}]}'
        )
        with mock.patch.object(services.urllib.request, 'urlopen', return_value=response):
            services._post_batch([{'to': TOKEN_PATIENT, 'title': 't', 'body': 'b'}])
        self.assertFalse(PushDevice.objects.get(token=TOKEN_PATIENT).is_active)


class PushDeviceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.first = Account.objects.create_user('+919800000004')
        self.second = Account.objects.create_user('+919800000005')

    def test_register_moves_token_to_latest_account_and_delete_removes_it(self):
        self.client.force_authenticate(self.first)
        r = self.client.post('/api/auth/push-devices/', {'token': TOKEN_PATIENT, 'platform': 'android'}, format='json')
        self.assertEqual(r.status_code, 204)

        self.client.force_authenticate(self.second)
        self.client.post('/api/auth/push-devices/', {'token': TOKEN_PATIENT}, format='json')
        self.assertEqual(PushDevice.objects.get(token=TOKEN_PATIENT).account, self.second)

        r = self.client.delete('/api/auth/push-devices/', {'token': TOKEN_PATIENT}, format='json')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(PushDevice.objects.exists())

    def test_rejects_non_expo_token(self):
        self.client.force_authenticate(self.first)
        r = self.client.post('/api/auth/push-devices/', {'token': 'not-a-token'}, format='json')
        self.assertEqual(r.status_code, 400)
