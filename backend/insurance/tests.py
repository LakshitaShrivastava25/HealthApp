from datetime import timedelta
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account
from ai.text_extraction import ExtractionResult
from family.models import Profile

from . import processing
from .models import InsurancePolicy, PolicyExclusion


def _client(account):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(account).access_token))
    return client


def _pdf(name='policy.pdf'):
    return SimpleUploadedFile(name, b'%PDF-1.4 minimal', content_type='application/pdf')


AI_RESULT = {
    'insurer': 'Star Health',
    'policy_number': 'SH/1',
    'policy_type': 'Family Optima',
    'sum_insured': '500000',
    'premium_amount': '12000',
    'coverage_start': '2026-04-01',
    'coverage_end': '2027-03-31',
    'room_rent_limit': '1% of SI',
    'co_payment_percent': '10',
    'exclusions': ['Cosmetic surgery', 'Dental'],
    'waiting_periods': [{'condition': 'Pre-existing', 'months': 36}],
    'sub_limits': [{'category': 'Cataract', 'limit': '40000 per eye'}],
}


@override_settings(ANTHROPIC_API_KEY='')
class PolicyBackgroundReadTests(TestCase):
    def setUp(self):
        self.account = Account.objects.create_user('+919300000001')
        self.profile = Profile.objects.create(account=self.account, full_name='Owner', relation='self')
        self.api = _client(self.account)

    def _upload(self):
        return self.api.post(
            '/api/insurance/', {'profile': str(self.profile.id), 'file': _pdf()}, format='multipart'
        )

    def _policy(self, **fields):
        return InsurancePolicy.objects.create(profile=self.profile, file='insurance/p.pdf', **fields)

    def test_upload_answers_before_the_policy_is_read(self):
        # Outside tests the read runs in a thread: the upload must answer
        # with the policy still processing, not wait for the AI call.
        with override_settings(TESTING=False), mock.patch.object(processing.threading, 'Thread') as thread:
            response = self._upload()

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data['status'], 'processing')
        thread.assert_called_once()
        kwargs = thread.call_args.kwargs
        self.assertIs(kwargs['target'], processing._analyze_policy_background)
        self.assertEqual(str(kwargs['args'][0]), response.data['id'])
        thread.return_value.start.assert_called_once()

        policy = InsurancePolicy.objects.get(pk=response.data['id'])
        self.assertIsNotNone(policy.processing_started_at)

        # The thread's work, run here: the policy leaves processing.
        processing._analyze_policy_background(policy.pk)
        policy.refresh_from_db()
        self.assertEqual(policy.status, InsurancePolicy.Status.NEEDS_REVIEW)

    def test_a_read_fills_in_the_policy(self):
        with mock.patch.object(processing, 'extract_text', return_value=ExtractionResult('policy text', 'pdf_native')), \
                mock.patch.object(processing.ClaudeService, 'analyze_insurance_policy', return_value=dict(AI_RESULT)):
            response = self._upload()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], 'needs_review')
        self.assertEqual(response.data['insurer'], 'Star Health')
        self.assertEqual(len(response.data['exclusions']), 2)
        self.assertEqual(len(response.data['waiting_periods']), 1)
        self.assertEqual(len(response.data['sub_limits']), 1)

    def test_a_crashed_read_is_never_left_processing(self):
        policy = self._policy(status=InsurancePolicy.Status.PROCESSING, processing_started_at=timezone.now())
        with mock.patch.object(processing, 'analyze_policy', side_effect=RuntimeError('boom')):
            processing._analyze_policy_background(policy.pk)

        policy.refresh_from_db()
        self.assertEqual(policy.status, InsurancePolicy.Status.NEEDS_REVIEW)
        self.assertTrue(policy.structured_data['_extraction_failed'])
        self.assertEqual(policy.structured_data['note'], processing.FAILED_NOTE)

    def test_a_policy_deleted_mid_read_is_not_brought_back(self):
        policy = self._policy(status=InsurancePolicy.Status.PROCESSING, processing_started_at=timezone.now())

        def delete_then_extract(_file):
            InsurancePolicy.objects.filter(pk=policy.pk).delete()
            return ExtractionResult('policy text', 'pdf_native')

        with mock.patch.object(processing, 'extract_text', side_effect=delete_then_extract), \
                mock.patch.object(processing.ClaudeService, 'analyze_insurance_policy', return_value=dict(AI_RESULT)):
            processing._analyze_policy_background(policy.pk)

        self.assertFalse(InsurancePolicy.objects.filter(pk=policy.pk).exists())
        self.assertFalse(PolicyExclusion.objects.exists())

    def test_an_interrupted_read_expires_instead_of_spinning_forever(self):
        old = timezone.now() - processing.STALE_PROCESSING_AFTER - timedelta(minutes=1)
        stuck = self._policy(status=InsurancePolicy.Status.PROCESSING, processing_started_at=old)
        # Rows from before processing_started_at existed fall back to uploaded_at.
        legacy = self._policy(status=InsurancePolicy.Status.PROCESSING)
        InsurancePolicy.objects.filter(pk=legacy.pk).update(uploaded_at=old)
        fresh = self._policy(status=InsurancePolicy.Status.PROCESSING, processing_started_at=timezone.now())

        response = self.api.get('/api/insurance/', {'profile_id': str(self.profile.id)})
        self.assertEqual(response.status_code, 200)

        for policy in (stuck, legacy):
            policy.refresh_from_db()
            self.assertEqual(policy.status, InsurancePolicy.Status.NEEDS_REVIEW)
            self.assertTrue(policy.structured_data['_interrupted'])
        fresh.refresh_from_db()
        self.assertEqual(fresh.status, InsurancePolicy.Status.PROCESSING)

    def test_a_policy_being_read_cannot_be_confirmed_or_edited(self):
        policy = self._policy(status=InsurancePolicy.Status.PROCESSING, processing_started_at=timezone.now())

        response = self.api.post(f'/api/insurance/{policy.id}/confirm/')
        self.assertEqual(response.status_code, 409)
        response = self.api.patch(f'/api/insurance/{policy.id}/', {'insurer': 'X'}, format='json')
        self.assertEqual(response.status_code, 400)

        policy.refresh_from_db()
        self.assertEqual(policy.status, InsurancePolicy.Status.PROCESSING)
        self.assertEqual(policy.insurer, '')

    def test_retry_reads_the_policy_again_and_replaces_old_findings(self):
        policy = self._policy(
            status=InsurancePolicy.Status.NEEDS_REVIEW,
            structured_data={'_extraction_failed': True, '_interrupted': True},
        )
        PolicyExclusion.objects.create(policy=policy, description='stale')

        with mock.patch.object(processing, 'extract_text', return_value=ExtractionResult('policy text', 'pdf_native')), \
                mock.patch.object(processing.ClaudeService, 'analyze_insurance_policy', return_value=dict(AI_RESULT)):
            response = self.api.post(f'/api/insurance/{policy.id}/retry-processing/')

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['insurer'], 'Star Health')
        self.assertEqual(
            sorted(e['description'] for e in response.data['exclusions']), ['Cosmetic surgery', 'Dental']
        )
        self.assertNotIn('_interrupted', response.data['structured_data'])

    def test_retry_is_refused_while_a_read_is_running(self):
        policy = self._policy(status=InsurancePolicy.Status.PROCESSING, processing_started_at=timezone.now())
        response = self.api.post(f'/api/insurance/{policy.id}/retry-processing/')
        self.assertEqual(response.status_code, 409)

    def test_retry_is_allowed_once_a_read_has_gone_stale(self):
        old = timezone.now() - processing.STALE_PROCESSING_AFTER - timedelta(minutes=1)
        policy = self._policy(status=InsurancePolicy.Status.PROCESSING, processing_started_at=old)
        response = self.api.post(f'/api/insurance/{policy.id}/retry-processing/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'needs_review')
