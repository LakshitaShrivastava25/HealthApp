"""
Cross-tenant write protection.

Every medical record hangs off a Profile whose id the client supplies in
the request body. That id is not secret — the patient app shows it as the
"Patient Reference ID" and tells people to hand it to their doctor — so
each write path has to verify the submitted profile actually belongs to
the caller. These tests run the real attack against every such path.
"""

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account
from emergency.models import EmergencyProfile
from family.models import AllergyRecord, Profile
from medicines.models import Medication, ReminderSchedule


def _pdf(name):
    return SimpleUploadedFile(name, b'%PDF-1.4 minimal', content_type='application/pdf')


class CrossTenantWriteTests(TestCase):
    def setUp(self):
        self.victim = Account.objects.create_user(phone_number='+919000000001')
        self.attacker = Account.objects.create_user(phone_number='+919000000002')
        self.victim_profile = Profile.objects.create(
            account=self.victim, full_name='Victim Patient', relation='self'
        )
        self.attacker_profile = Profile.objects.create(
            account=self.attacker, full_name='Attacker', relation='self'
        )
        self.client_attacker = APIClient()
        self.client_attacker.credentials(
            HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(self.attacker).access_token)
        )

    # -- the attack, one path per test --------------------------------

    def test_cannot_add_medication_to_another_patient(self):
        response = self.client_attacker.post(
            '/api/medications/',
            {'profile': str(self.victim_profile.id), 'name': 'Injected Drug', 'dosage': '999mg'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Medication.objects.filter(profile=self.victim_profile).exists())

    def test_cannot_add_allergy_to_another_patient(self):
        response = self.client_attacker.post(
            '/api/allergies/',
            {'profile': str(self.victim_profile.id), 'kind': 'drug', 'substance': 'Injected Allergy'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(AllergyRecord.objects.filter(profile=self.victim_profile).exists())

    def test_cannot_upload_document_to_another_patient(self):
        response = self.client_attacker.post(
            '/api/documents/',
            {'profile': str(self.victim_profile.id), 'file': _pdf('evil.pdf'),
             'category': 'report', 'title': 'Injected Report'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.victim_profile.documents.exists())

    def test_cannot_upload_insurance_policy_to_another_patient(self):
        response = self.client_attacker.post(
            '/api/insurance/',
            {'profile': str(self.victim_profile.id), 'file': _pdf('policy.pdf')},
            format='multipart',
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.victim_profile.insurance_policies.exists())

    def test_cannot_publish_emergency_card_for_another_patient(self):
        """
        The worst case: this endpoint mints a PUBLIC, unauthenticated card.
        A success here would expose the victim's name, blood group,
        allergies and medications to anyone with the link, under an
        emergency contact number the attacker chose.
        """
        response = self.client_attacker.post(
            '/api/emergency-qr/',
            {'profile': str(self.victim_profile.id),
             'emergency_contact_name': 'Attacker Controlled',
             'emergency_contact_phone': '+910000000000'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(hasattr(self.victim_profile, 'emergency_profile'))

    def test_emergency_card_attack_is_403_even_when_victim_already_has_one(self):
        """
        EmergencyProfile.profile is a OneToOneField, so DRF's uniqueness
        validator runs before perform_create. Against a victim who already
        had a card that produced 400 "already exists" rather than 403 —
        refusing the write, but confirming to a stranger that the profile id
        they guessed is real and already has a card. The answer must be 403
        whether or not a card exists.
        """
        EmergencyProfile.objects.create(
            profile=self.victim_profile, emergency_contact_name='Real Contact'
        )
        response = self.client_attacker.post(
            '/api/emergency-qr/',
            {'profile': str(self.victim_profile.id),
             'emergency_contact_name': 'Attacker Controlled',
             'emergency_contact_phone': '+910000000000'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertNotIn('already exists', str(response.data))
        # The genuine card is untouched.
        self.victim_profile.emergency_profile.refresh_from_db()
        self.assertEqual(self.victim_profile.emergency_profile.emergency_contact_name, 'Real Contact')

    def test_cannot_attach_reminder_to_another_patients_medication(self):
        medication = Medication.objects.create(profile=self.victim_profile, name='Real Medicine')
        response = self.client_attacker.post(
            '/api/reminders/', {'medication': str(medication.id), 'time_of_day': '08:00'}, format='json'
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ReminderSchedule.objects.filter(medication=medication).exists())

    def test_cannot_log_dose_against_another_patients_reminder(self):
        medication = Medication.objects.create(profile=self.victim_profile, name='Real Medicine')
        reminder = ReminderSchedule.objects.create(medication=medication, time_of_day='08:00')
        response = self.client_attacker.post(
            '/api/dose-logs/',
            {'reminder': str(reminder.id), 'status': 'taken', 'scheduled_for': '2026-01-01T08:00:00Z'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(reminder.logs.exists())

    def test_cannot_move_own_record_onto_another_profile_by_patching(self):
        """The update path needs the same guard — otherwise a record can be
        created legitimately and then re-parented onto a stranger."""
        medication = Medication.objects.create(profile=self.attacker_profile, name='Mine')
        response = self.client_attacker.patch(
            f'/api/medications/{medication.id}/', {'profile': str(self.victim_profile.id)}, format='json'
        )
        self.assertEqual(response.status_code, 403)
        medication.refresh_from_db()
        self.assertEqual(medication.profile_id, self.attacker_profile.id)

    # -- the legitimate case must still work ---------------------------

    def test_patient_can_still_write_to_their_own_profile(self):
        response = self.client_attacker.post(
            '/api/medications/',
            {'profile': str(self.attacker_profile.id), 'name': 'My Medicine', 'dosage': '500mg'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Medication.objects.filter(profile=self.attacker_profile).exists())

    def test_patient_can_still_publish_their_own_emergency_card(self):
        response = self.client_attacker.post(
            '/api/emergency-qr/',
            {'profile': str(self.attacker_profile.id),
             'emergency_contact_name': 'My Spouse', 'emergency_contact_phone': '+919812345678'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        public = Client().get(f"/api/public/emergency/{response.data['public_token']}/?format=json")
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.json()['name'], 'Attacker')
