"""
One login, two modes.

The apps let a patient register as a doctor from the same account and then
switch between User and Doctor mode. Each request says which mode it is in
with ?acting_as= (doctors/access.py). These tests pin down that:

  - user mode gives a doctor account full patient features over its OWN
    family, and nothing of anyone else's;
  - doctor mode stays exactly as before — read-only, approved patients only;
  - no parameter keeps the old behaviour, so installed app builds still work;
  - the parameter can never widen access (a patient claiming doctor mode
    gets nothing extra, an unverified doctor reads nothing).
"""

from datetime import timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account
from documents.models import Document, TimelineEvent
from family.models import AllergyRecord, Profile
from medicines.models import Medication

from .models import ConsultationNote, Doctor, DoctorPatientAccess


def _client(account):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(account).access_token))
    return client


def _ids(response):
    data = response.data
    rows = data['results'] if isinstance(data, dict) and 'results' in data else data
    return {str(row['id']) for row in rows}


def _make_doctor(account, status=Doctor.VerificationStatus.VERIFIED, name='Dual Role'):
    return Doctor.objects.create(
        account=account,
        full_name=name,
        specialization='General Medicine',
        registration_number=f'REG-{account.phone_number[-4:]}',
        clinic_name='Family Clinic',
        clinic_address='1 Main Road',
        booking_phone_number='+912212345678',
        verification_status=status,
    )


@override_settings(ANTHROPIC_API_KEY='')
class DualRoleTests(TestCase):
    def setUp(self):
        # The account under test: a doctor who is also a patient.
        self.dual = Account.objects.create_user('+919100000001', role=Account.Role.DOCTOR)
        self.dual_profile = Profile.objects.create(account=self.dual, full_name='Dr Self', relation='self')
        self.doctor = _make_doctor(self.dual)

        # A patient who approved the dual account's access request.
        self.patient = Account.objects.create_user('+919100000002')
        self.patient_profile = Profile.objects.create(account=self.patient, full_name='Granted', relation='self')
        self.grant = DoctorPatientAccess.objects.create(
            doctor=self.doctor, profile=self.patient_profile, status=DoctorPatientAccess.Status.APPROVED
        )

        # A patient nobody has access to.
        self.stranger = Account.objects.create_user('+919100000003')
        self.stranger_profile = Profile.objects.create(account=self.stranger, full_name='Stranger', relation='self')

        for profile in (self.dual_profile, self.patient_profile, self.stranger_profile):
            doc = Document.objects.create(
                profile=profile, title=f'{profile.full_name} report', file='documents/x.pdf',
                status=Document.Status.PROCESSED,
            )
            TimelineEvent.objects.create(
                profile=profile, source_document=doc, event_date=timezone.localdate(),
                event_type='report', title=f'{profile.full_name} event',
            )
            Medication.objects.create(profile=profile, name=f'{profile.full_name} med')
            AllergyRecord.objects.create(profile=profile, kind='drug', substance=f'{profile.full_name} allergen')

        self.api = _client(self.dual)

    # -- user mode -----------------------------------------------------------

    def test_user_mode_lists_only_own_profiles(self):
        response = self.api.get('/api/profiles/', {'acting_as': 'patient'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(_ids(response), {str(self.dual_profile.id)})

    def test_user_mode_can_add_a_family_member(self):
        response = self.api.post(
            '/api/profiles/?acting_as=patient', {'full_name': 'My Mother', 'relation': 'mother'}, format='json'
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(Profile.objects.filter(account=self.dual, full_name='My Mother').exists())

    def test_user_mode_can_edit_own_profile(self):
        response = self.api.patch(
            f'/api/profiles/{self.dual_profile.id}/?acting_as=patient', {'blood_group': 'O+'}, format='json'
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_user_mode_reads_own_records_and_never_the_granted_patients(self):
        for url in ('/api/documents/', '/api/timeline/', '/api/medications/', '/api/allergies/'):
            own = self.api.get(url, {'acting_as': 'patient', 'profile_id': str(self.dual_profile.id)})
            self.assertEqual(own.status_code, 200, url)
            self.assertEqual(len(_ids(own)), 1, url)

            granted = self.api.get(url, {'acting_as': 'patient', 'profile_id': str(self.patient_profile.id)})
            self.assertEqual(granted.status_code, 200, url)
            self.assertEqual(_ids(granted), set(), f'{url} leaked a granted patient into user mode')

    def test_user_mode_gets_the_full_medication_shape(self):
        response = self.api.get('/api/medications/', {'acting_as': 'patient'})
        row = response.data['results'][0]
        # The doctor serializer drops the personal reminder schedule.
        self.assertIn('reminders', row)

    def test_user_mode_can_write_own_records(self):
        response = self.api.post(
            '/api/allergies/?acting_as=patient',
            {'profile': str(self.dual_profile.id), 'kind': 'food', 'substance': 'Peanuts'},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

        response = self.api.post(
            '/api/documents/?acting_as=patient',
            {
                'profile': str(self.dual_profile.id),
                'category': 'other',
                'file': SimpleUploadedFile('mine.pdf', b'%PDF-1.4 mine', content_type='application/pdf'),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_user_mode_still_cannot_write_into_a_granted_patient(self):
        response = self.api.post(
            '/api/allergies/?acting_as=patient',
            {'profile': str(self.patient_profile.id), 'kind': 'food', 'substance': 'Injected'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_user_mode_can_use_the_ai_assistant_on_own_profile(self):
        with patch('family.views.ClaudeService.answer_health_question', return_value={'answer': 'ok'}):
            response = self.api.post(
                f'/api/profiles/{self.dual_profile.id}/ask/?acting_as=patient', {'question': 'hi'}, format='json'
            )
        self.assertEqual(response.status_code, 200, response.data)

    def test_user_mode_answers_requests_for_own_family(self):
        other_account = Account.objects.create_user('+919100000004', role=Account.Role.DOCTOR)
        other_doctor = _make_doctor(other_account, name='Other Doctor')
        request = DoctorPatientAccess.objects.create(doctor=other_doctor, profile=self.dual_profile)

        listed = self.api.get('/api/doctor-access/', {'acting_as': 'patient'})
        self.assertEqual(_ids(listed), {str(request.id)})

        response = self.api.post(f'/api/doctor-access/{request.id}/approve/?acting_as=patient')
        self.assertEqual(response.status_code, 200, response.data)
        request.refresh_from_db()
        self.assertEqual(request.status, DoctorPatientAccess.Status.APPROVED)

    def test_user_mode_cannot_approve_a_grant_on_someone_elses_profile(self):
        pending = DoctorPatientAccess.objects.create(doctor=self.doctor, profile=self.stranger_profile)
        response = self.api.post(f'/api/doctor-access/{pending.id}/approve/?acting_as=patient')
        self.assertEqual(response.status_code, 404)
        pending.refresh_from_db()
        self.assertEqual(pending.status, DoctorPatientAccess.Status.PENDING)

    def test_user_mode_cannot_request_patient_access(self):
        response = self.api.post(
            '/api/doctor-access/?acting_as=patient',
            {'doctor': str(self.doctor.id), 'profile': self.stranger_profile.reference_code},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    # -- doctor mode ---------------------------------------------------------

    def test_doctor_mode_reads_granted_patient_only(self):
        for url in ('/api/documents/', '/api/timeline/', '/api/medications/', '/api/allergies/'):
            granted = self.api.get(url, {'acting_as': 'doctor', 'profile_id': str(self.patient_profile.id)})
            self.assertEqual(len(_ids(granted)), 1, url)
            stranger = self.api.get(url, {'acting_as': 'doctor', 'profile_id': str(self.stranger_profile.id)})
            self.assertEqual(_ids(stranger), set(), url)

    def test_doctor_mode_is_read_only(self):
        response = self.api.post(
            '/api/profiles/?acting_as=doctor', {'full_name': 'X', 'relation': 'other'}, format='json'
        )
        self.assertEqual(response.status_code, 403)
        response = self.api.post(
            '/api/allergies/?acting_as=doctor',
            {'profile': str(self.patient_profile.id), 'kind': 'food', 'substance': 'X'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        response = self.api.post(f'/api/profiles/{self.patient_profile.id}/ask/?acting_as=doctor', {'question': 'hi'})
        self.assertEqual(response.status_code, 403)

    def test_doctor_mode_cannot_approve_requests(self):
        pending = DoctorPatientAccess.objects.create(doctor=self.doctor, profile=self.stranger_profile)
        response = self.api.post(f'/api/doctor-access/{pending.id}/approve/?acting_as=doctor')
        self.assertEqual(response.status_code, 403)

    def test_doctor_mode_lists_its_own_requests_not_its_familys(self):
        listed = self.api.get('/api/doctor-access/', {'acting_as': 'doctor'})
        self.assertEqual(_ids(listed), {str(self.grant.id)})

    def test_doctor_mode_can_write_a_note_for_a_granted_patient(self):
        response = self.api.post(
            '/api/consultation-notes/?acting_as=doctor',
            {'profile': str(self.patient_profile.id), 'diagnosis': 'Flu'},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

    # -- no parameter: the old behaviour ------------------------------------

    def test_legacy_requests_from_a_doctor_account_act_as_doctor(self):
        response = self.api.get('/api/documents/', {'profile_id': str(self.patient_profile.id)})
        self.assertEqual(len(_ids(response)), 1)
        response = self.api.post('/api/profiles/', {'full_name': 'X', 'relation': 'other'}, format='json')
        self.assertEqual(response.status_code, 403)

    # -- the parameter cannot widen access ----------------------------------

    def test_a_patient_claiming_doctor_mode_gets_nothing_extra(self):
        api = _client(self.stranger)
        for url in ('/api/documents/', '/api/timeline/', '/api/medications/', '/api/allergies/'):
            response = api.get(url, {'acting_as': 'doctor', 'profile_id': str(self.patient_profile.id)})
            self.assertEqual(_ids(response), set(), url)
        response = api.get('/api/profiles/', {'acting_as': 'doctor'})
        self.assertEqual(_ids(response), {str(self.stranger_profile.id)})
        response = api.post(
            '/api/doctor-access/?acting_as=doctor',
            {'doctor': str(self.doctor.id), 'profile': self.patient_profile.reference_code},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_an_unverified_doctor_reads_no_granted_records(self):
        self.doctor.verification_status = Doctor.VerificationStatus.PENDING
        self.doctor.save()
        for url in ('/api/documents/', '/api/timeline/', '/api/medications/', '/api/allergies/'):
            response = self.api.get(url, {'acting_as': 'doctor', 'profile_id': str(self.patient_profile.id)})
            self.assertEqual(_ids(response), set(), url)
        response = self.api.get('/api/profiles/', {'acting_as': 'doctor'})
        self.assertNotIn(str(self.patient_profile.id), _ids(response))
        response = self.api.post(
            '/api/consultation-notes/?acting_as=doctor',
            {'profile': str(self.patient_profile.id), 'diagnosis': 'Flu'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_an_expired_grant_reads_nothing(self):
        self.grant.expires_at = timezone.now() - timedelta(minutes=1)
        self.grant.save()
        response = self.api.get('/api/documents/', {'acting_as': 'doctor', 'profile_id': str(self.patient_profile.id)})
        self.assertEqual(_ids(response), set())


class RegisterFromPatientAccountTests(TestCase):
    """The journey the apps offer: sign in as a user, then register as a doctor."""

    def test_registering_keeps_the_patient_side_working(self):
        account = Account.objects.create_user('+919100000010')
        profile = Profile.objects.create(account=account, full_name='Asha', relation='self')
        api = _client(account)

        response = api.post(
            '/api/doctors/',
            {
                'full_name': 'Dr. Asha Rao',
                'specialization': 'Paediatrics',
                'qualification': 'MBBS',
                'experience_years': 5,
                'clinic_name': 'Kids Clinic',
                'registration_number': 'MCI-778899',
                'clinic_address': '4 Park Street',
                'booking_phone_number': '+919812345678',
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.data)
        doctor_id = response.data['id']
        account.refresh_from_db()
        self.assertEqual(account.role, Account.Role.DOCTOR)
        self.assertEqual(response.data['verification_status'], 'pending')
        self.assertEqual(response.data['full_name'], 'Asha Rao')

        # Still a patient in user mode.
        response = api.get('/api/profiles/', {'acting_as': 'patient'})
        self.assertEqual(_ids(response), {str(profile.id)})
        response = api.post(
            '/api/allergies/?acting_as=patient',
            {'profile': str(profile.id), 'kind': 'food', 'substance': 'Milk'},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

        # Pending, so doctor mode can't request access yet.
        response = api.post(
            '/api/doctor-access/?acting_as=doctor',
            {'doctor': doctor_id, 'profile': profile.reference_code},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

        # A second registration is refused rather than crashing.
        response = api.post(
            '/api/doctors/',
            {
                'full_name': 'Asha Rao', 'specialization': 'X', 'clinic_name': 'Y',
                'registration_number': 'Z', 'clinic_address': 'W', 'booking_phone_number': '+919812345678',
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ConsultationNote.objects.count(), 0)


@override_settings(ANTHROPIC_API_KEY='')
class GrantTamperingTests(TestCase):
    """Grants and notes can be created and read, never edited or deleted."""

    def setUp(self):
        self.doctor_account = Account.objects.create_user('+919100000020', role=Account.Role.DOCTOR)
        self.doctor = _make_doctor(self.doctor_account, name='Granted Doctor')
        self.patient = Account.objects.create_user('+919100000021')
        self.patient_profile = Profile.objects.create(account=self.patient, full_name='Consenting', relation='self')
        self.victim = Account.objects.create_user('+919100000022')
        self.victim_profile = Profile.objects.create(account=self.victim, full_name='Victim', relation='self')
        self.grant = DoctorPatientAccess.objects.create(
            doctor=self.doctor, profile=self.patient_profile, status=DoctorPatientAccess.Status.APPROVED
        )

    def test_doctor_cannot_move_an_approved_grant_onto_another_patient(self):
        api = _client(self.doctor_account)
        for method in ('patch', 'put'):
            response = getattr(api, method)(
                f'/api/doctor-access/{self.grant.id}/',
                {'profile': self.victim_profile.reference_code, 'doctor': str(self.doctor.id)},
                format='json',
            )
            self.assertEqual(response.status_code, 405, method)
        self.grant.refresh_from_db()
        self.assertEqual(self.grant.profile_id, self.patient_profile.id)
        self.assertFalse(DoctorPatientAccess.objects.filter(profile=self.victim_profile).exists())

    def test_patient_cannot_move_a_grant_onto_another_patient(self):
        response = _client(self.patient).patch(
            f'/api/doctor-access/{self.grant.id}/',
            {'profile': self.victim_profile.reference_code},
            format='json',
        )
        self.assertEqual(response.status_code, 405)
        self.grant.refresh_from_db()
        self.assertEqual(self.grant.profile_id, self.patient_profile.id)

    def test_grants_cannot_be_deleted(self):
        response = _client(self.patient).delete(f'/api/doctor-access/{self.grant.id}/')
        self.assertEqual(response.status_code, 405)
        self.assertTrue(DoctorPatientAccess.objects.filter(pk=self.grant.pk).exists())

    def test_notes_cannot_be_moved_or_rewritten(self):
        note = ConsultationNote.objects.create(doctor=self.doctor, profile=self.patient_profile, diagnosis='Flu')
        response = _client(self.doctor_account).patch(
            f'/api/consultation-notes/{note.id}/', {'profile': str(self.victim_profile.id)}, format='json'
        )
        self.assertEqual(response.status_code, 405)
        response = _client(self.patient).patch(
            f'/api/consultation-notes/{note.id}/', {'diagnosis': 'Nothing'}, format='json'
        )
        self.assertEqual(response.status_code, 405)
        note.refresh_from_db()
        self.assertEqual((note.profile_id, note.diagnosis), (self.patient_profile.id, 'Flu'))

    def test_duplicate_request_says_so_clearly(self):
        response = _client(self.doctor_account).post(
            '/api/doctor-access/', {'profile': self.patient_profile.reference_code}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['detail'], 'You have already requested access to this patient.')

    def test_a_patient_learns_nothing_about_existing_grants(self):
        # Naming a real doctor and an already-granted profile used to answer
        # 400 "must make a unique set", confirming the relationship exists.
        response = _client(self.victim).post(
            '/api/doctor-access/',
            {'doctor': str(self.doctor.id), 'profile': self.patient_profile.reference_code},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_request_ignores_a_doctor_id_in_the_body(self):
        other_account = Account.objects.create_user('+919100000023', role=Account.Role.DOCTOR)
        other = _make_doctor(other_account, name='Other')
        response = _client(self.doctor_account).post(
            '/api/doctor-access/',
            {'doctor': str(other.id), 'profile': self.victim_profile.reference_code},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['doctor'], self.doctor.id)
