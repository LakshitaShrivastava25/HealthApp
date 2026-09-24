"""
What the doctor directory exposes.

/api/doctors/ was serving DoctorSerializer to any authenticated account,
which meant every logged-in patient could read every doctor's medical
registration number and a URL to their uploaded licence document — an
identity document submitted for admin verification, not for publication.
Unverified registrations were listed alongside verified ones too.
"""

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account
from doctors.models import Doctor


class DoctorDirectoryExposureTests(TestCase):
    def setUp(self):
        self.patient = Account.objects.create_user(phone_number='+919000002001')

        self.verified_account = Account.objects.create_user(
            phone_number='+919000002002', role=Account.Role.DOCTOR
        )
        self.verified = Doctor.objects.create(
            account=self.verified_account,
            full_name='Verified Doctor',
            specialization='Cardiology',
            registration_number='MCI-VERIFIED-12345',
            clinic_name='City Heart Clinic',
            clinic_address='12 MG Road',
            booking_phone_number='+912212345678',
            license_document=SimpleUploadedFile('licence.pdf', b'%PDF-1.4 licence',
                                                content_type='application/pdf'),
            verification_status=Doctor.VerificationStatus.VERIFIED,
        )

        self.pending_account = Account.objects.create_user(
            phone_number='+919000002003', role=Account.Role.DOCTOR
        )
        self.pending = Doctor.objects.create(
            account=self.pending_account,
            full_name='Pending Doctor',
            specialization='Dermatology',
            registration_number='MCI-PENDING-99999',
            clinic_name='Skin Care',
            clinic_address='7 Link Road',
            booking_phone_number='+912298765432',
            verification_status=Doctor.VerificationStatus.PENDING,
        )

    def api_as(self, account):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(account).access_token)
        )
        return client

    def test_directory_never_exposes_licence_or_registration_number(self):
        response = self.api_as(self.patient).get('/api/doctors/')
        self.assertEqual(response.status_code, 200)
        rows = response.data['results']
        self.assertTrue(rows)
        for row in rows:
            self.assertNotIn('license_document', row)
            self.assertNotIn('registration_number', row)
        # Belt and braces: the value must not appear anywhere in the payload.
        self.assertNotIn('MCI-VERIFIED-12345', str(response.data))

    def test_directory_still_carries_what_find_care_renders(self):
        response = self.api_as(self.patient).get('/api/doctors/')
        row = response.data['results'][0]
        for field in ('id', 'full_name', 'specialization', 'experience_years',
                      'verification_status', 'clinic_name', 'clinic_address',
                      'booking_phone_number', 'available_days',
                      'clinic_open_time', 'clinic_close_time'):
            self.assertIn(field, row)

    def test_unverified_doctors_are_not_listed_to_patients(self):
        response = self.api_as(self.patient).get('/api/doctors/')
        names = {row['full_name'] for row in response.data['results']}
        self.assertIn('Verified Doctor', names)
        self.assertNotIn('Pending Doctor', names)

    def test_a_patient_cannot_fetch_an_unverified_doctor_by_id(self):
        response = self.api_as(self.patient).get(f'/api/doctors/{self.pending.id}/')
        self.assertEqual(response.status_code, 404)

    def test_a_doctor_can_still_load_their_own_unverified_record(self):
        """A pending or rejected doctor must not be hidden from themselves —
        the verification screen reads this."""
        response = self.api_as(self.pending_account).get('/api/doctors/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['full_name'], 'Pending Doctor')
        # Their own credentials are theirs to see.
        self.assertEqual(response.data['registration_number'], 'MCI-PENDING-99999')

    def test_registration_still_accepts_the_credential_fields(self):
        newcomer = Account.objects.create_user(phone_number='+919000002004')
        response = self.api_as(newcomer).post(
            '/api/doctors/',
            {'full_name': 'New Doctor', 'specialization': 'ENT',
             'registration_number': 'MCI-NEW-55555', 'clinic_name': 'ENT Care',
             'clinic_address': '1 Hill Road', 'booking_phone_number': '+912233334444'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            Doctor.objects.get(account=newcomer).registration_number, 'MCI-NEW-55555'
        )

    def test_a_patient_cannot_edit_a_doctor_record(self):
        response = self.api_as(self.patient).patch(
            f'/api/doctors/{self.verified.id}/', {'full_name': 'Hijacked'}, format='json'
        )
        self.assertIn(response.status_code, (403, 404))
        self.verified.refresh_from_db()
        self.assertEqual(self.verified.full_name, 'Verified Doctor')
