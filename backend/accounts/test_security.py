"""
Regression tests for the security review: each test runs the attack that
used to work and checks it is refused now.
"""

from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account
from family.models import Profile
from insurance.models import InsurancePolicy


def _client(account):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(account).access_token))
    return client


class AccountTakeoverTests(TestCase):
    def test_phone_number_cannot_be_changed_through_me(self):
        attacker = Account.objects.create_user('+919200000001')
        response = _client(attacker).patch('/api/auth/me/', {'phone_number': '+919200000002'}, format='json')
        self.assertEqual(response.status_code, 200)
        attacker.refresh_from_db()
        self.assertEqual(attacker.phone_number, '+919200000001')
        # So the victim's first sign-in creates their OWN account.
        self.assertFalse(Account.objects.filter(phone_number='+919200000002').exists())


@override_settings(ANTHROPIC_API_KEY='')
class InsurancePolicyOwnershipTests(TestCase):
    def test_a_policy_cannot_be_moved_onto_someone_elses_profile(self):
        attacker = Account.objects.create_user('+919200000011')
        own = Profile.objects.create(account=attacker, full_name='Attacker', relation='self')
        victim = Account.objects.create_user('+919200000012')
        victim_profile = Profile.objects.create(account=victim, full_name='Victim', relation='self')
        policy = InsurancePolicy.objects.create(profile=own, file='insurance/p.pdf')

        response = _client(attacker).patch(
            f'/api/insurance/{policy.id}/', {'profile': str(victim_profile.id)}, format='json'
        )
        self.assertEqual(response.status_code, 403)
        policy.refresh_from_db()
        self.assertEqual(policy.profile_id, own.id)


@override_settings(ANTHROPIC_API_KEY='')
class UploadTypeTests(TestCase):
    def setUp(self):
        self.account = Account.objects.create_user('+919200000021')
        self.profile = Profile.objects.create(account=self.account, full_name='Owner', relation='self')
        self.api = _client(self.account)

    def _upload(self, url, name, body, **extra):
        return self.api.post(
            url,
            {'profile': str(self.profile.id), 'file': SimpleUploadedFile(name, body), **extra},
            format='multipart',
        )

    def test_html_svg_and_disguised_files_are_refused(self):
        for url, extra in (('/api/documents/', {'category': 'other'}), ('/api/insurance/', {})):
            for name, body in (('x.html', b'<script>alert(1)</script>'),
                               ('x.svg', b'<svg onload="alert(1)"/>'),
                               ('x.pdf', b'<html><script>alert(1)</script></html>'),
                               ('x.png', b'%PDF-1.4 not a png')):
                response = self._upload(url, name, body, **extra)
                self.assertEqual(response.status_code, 400, (url, name))
                self.assertIn('file', response.data)

    def test_real_pdfs_and_photos_are_accepted(self):
        for name, body in (('rx.pdf', b'%PDF-1.4 minimal'),
                           ('scan.jpg', b'\xff\xd8\xff\xe0 jpeg'),
                           ('scan.png', b'\x89PNG\r\n\x1a\n png')):
            response = self._upload('/api/documents/', name, body, category='other')
            self.assertEqual(response.status_code, 201, (name, response.data))

    def test_oversized_files_are_refused(self):
        with mock.patch('documents.validators.MAX_UPLOAD_BYTES', 10):
            response = self._upload('/api/documents/', 'big.pdf', b'%PDF-1.4 more than ten bytes', category='other')
        self.assertEqual(response.status_code, 400)


class StoredFileServingTests(TestCase):
    def test_a_stored_html_file_is_only_ever_a_sandboxed_download(self):
        # e.g. uploaded before uploads were restricted.
        name = default_storage.save('documents/evil.html', ContentFile(b'<script>alert(1)</script>'))
        response = APIClient().get(default_storage.url(name))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/octet-stream')
        self.assertTrue(response['Content-Disposition'].startswith('attachment;'))
        self.assertIn('sandbox', response['Content-Security-Policy'])
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')

    def test_a_pdf_still_opens_inline(self):
        name = default_storage.save('documents/rx.pdf', ContentFile(b'%PDF-1.4 rx'))
        response = APIClient().get(default_storage.url(name))
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response['Content-Disposition'].startswith('inline;'))


class BadProfileIdTests(TestCase):
    def test_a_malformed_profile_id_is_a_400_not_a_500(self):
        api = _client(Account.objects.create_user('+919200000031'))
        for url in ('/api/documents/', '/api/timeline/', '/api/medications/', '/api/allergies/',
                    '/api/insurance/', '/api/notifications/', '/api/doctor-access/', '/api/dose-logs/'):
            response = api.get(url, {'profile_id': 'not-a-uuid'})
            self.assertEqual(response.status_code, 400, url)


class OTPThrottleTests(TestCase):
    def test_one_client_cannot_walk_through_many_numbers(self):
        rates = {**SimpleRateThrottle.THROTTLE_RATES, 'otp_send': '3/hour'}
        with mock.patch.object(SimpleRateThrottle, 'THROTTLE_RATES', rates), \
                override_settings(DEBUG=True, TWILIO_VERIFY_SERVICE_SID='', USE_TWOFACTOR=False,
                                  USE_MASTER_OTP=False, REVIEWER_PHONE=''):
            from django.core.cache import cache
            cache.clear()
            client = APIClient(REMOTE_ADDR='203.0.113.9')
            codes = [
                client.post('/api/auth/send-otp/', {'phone_number': f'+91980000000{i}'}, format='json').status_code
                for i in range(5)
            ]
            cache.clear()
        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[3:], [429, 429])
