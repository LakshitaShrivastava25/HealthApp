"""
NMC register verification. Every HTTP call is mocked — these tests never
reach nmc.org.in.

The rule under test throughout: the register check records what it finds
and puts the doctor in front of an admin. It never verifies or rejects
anyone; only an admin's approve / reject does — however many providers
agree.
"""

import io
import json
import socket
import urllib.error
from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account

from .models import Doctor
from .services.verification import FULL, apply_verification, compute_name_match, verify_registration
from .services.verification.apify_provider import ApifyProvider
from .services.verification.base import Lookup
from .services.verification.parsers import same_number, strip_pii

URLOPEN = 'doctors.services.verification.nmc_provider.urllib.request.urlopen'
SLEEP = 'doctors.services.verification.nmc_provider.time.sleep'

ADMIN_PHONE = '+919300000099'


def record(**overrides):
    """One register row as NMC returns it — personal fields included."""
    row = {
        'id': 13997954, 'uprn_no': 'U123', 'name': 'ASHA KRISHNA RAO', 'registration_no': '2001123450',
        'registration_date': '19-12-2001', 'year_of_info': 2001, 'state_code': 'MAH',
        'state_medical_council': 'Maharashtra Medical Council', 'qualification': 'MBBS',
        'qualification_year': '2001', 'university': 'Mumbai University',
        'additional_qualifications': [{'qualification': 'MD', 'year': '2005', 'university': 'MUHS', 'x': 'y'}],
        'removed_status': None, 'removed_on': None, 'restored_on': None, 'remarks': None,
        'dob': '01-01-1975', 'father_name': 'SOMEONE RAO', 'permanent_address': '1 Private Street, Pune',
    }
    row.update(overrides)
    return row


class FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def nmc(search_rows=(), blacklist_rows=()):
    """A urlopen stand-in answering the search and blacklist endpoints."""
    def urlopen(request, timeout=None, context=None):
        url = request.full_url
        rows = blacklist_rows if 'black-list-doctors' in url else search_rows
        body = {'success': True, 'data': list(rows), 'pagination': {'total': len(rows)}}
        return FakeResponse(json.dumps(body).encode())
    return urlopen


def http_error(code):
    return urllib.error.HTTPError('https://nmc.org.in/x', code, 'error', {}, io.BytesIO(b''))


APIFY_ON = {'APIFY_TOKEN': 'apify-test-token'}
DECENTRO_ON = {
    'DECENTRO_CLIENT_ID': 'cid', 'DECENTRO_CLIENT_SECRET': 'secret',
    'DECENTRO_BASE_URL': 'https://in.staging.decentro.tech',
}
ALL_OFF = {
    'APIFY_TOKEN': '', 'DECENTRO_CLIENT_ID': '', 'DECENTRO_CLIENT_SECRET': '',
    'DOCTOR_VERIFY_PROVIDERS': ['nmc', 'apify', 'decentro'],
}


def apify_item(status='valid', **overrides):
    """One item as the Apify actor returns it — personal fields included."""
    item = {
        'mode': 'verify', 'status': status, 'isValid': status == 'valid', 'doctorName': 'ASHA KRISHNA RAO',
        'registrationId': '2001123450', 'nmcDoctorId': 3631, 'stateMedicalCouncil': 'Maharashtra Medical Council',
        'registrationDate': '19/12/2001', 'yearInfo': 2001, 'qualification': 'MBBS', 'qualificationYear': '2001',
        'university': 'Mumbai University', 'source': 'NMC Indian Medical Register',
        'dateOfBirth': '01/01/1975', 'address': '1 Private Street, Pune', 'uprnNo': 'U123', 'parentName': 'SOMEONE RAO',
    }
    item.update(overrides)
    return item


def decentro_found(**overrides):
    """(HTTP status, body) of a Decentro match, in the shape their docs give."""
    row = {
        'yearInfo': 2001, 'regDate': '19/12/2001', 'doctorId': 167348, 'firstName': 'ASHA KRISHNA RAO',
        'parentName': 'SOMEONE RAO', 'isNewDoctor': False, 'checkExistingUser': False, 'doctorDegree': 'MBBS',
        'university': 'Mumbai University', 'yearOfPassing': '2001', 'smcId': 16, 'registrationNo': '2001123450',
        'smcName': 'Maharashtra Medical Council', 'address': '1 Private Street, Pune', 'catagoryView': 'N/A',
        'removedStatus': False,
    }
    row.update(overrides)
    return 200, {
        'decentroTxnId': 'TXN1', 'status': 'SUCCESS', 'responseCode': 'S00000',
        'message': 'The NMC membership has been verified successfully.', 'data': [row],
        'responseKey': 'success_professional_verification',
    }


DECENTRO_NO_RECORD = (404, {
    'decentroTxnId': 'TXN2', 'status': 'FAILURE', 'responseCode': 'S00000',
    'message': 'No NMC record found for provided details.', 'responseKey': 'error_no_record_found',
})


def services(nmc_rows=None, apify=None, decentro=None, calls=None):
    """
    A urlopen stand-in for every provider. None means that service is down:
    nmc_rows — register rows; apify — the actor's items; decentro — (status,
    body). Every request lands in `calls` when given.
    """
    def urlopen(request, timeout=None, context=None):
        url = request.full_url
        if calls is not None:
            calls.append(request)
        if 'nmc.org.in' in url:
            if nmc_rows is None:
                raise urllib.error.URLError('nmc down')
            return nmc(nmc_rows)(request, timeout, context)
        if 'apify.com' in url:
            if apify is None:
                raise urllib.error.URLError('apify down')
            response = FakeResponse(json.dumps(apify).encode())
            response.status = 201
            return response
        if 'decentro' in url:
            if decentro is None:
                raise urllib.error.URLError('decentro down')
            status, body = decentro
            if status >= 400:
                raise urllib.error.HTTPError(url, status, 'error', {}, io.BytesIO(json.dumps(body).encode()))
            return FakeResponse(json.dumps(body).encode())
        raise AssertionError(f'unexpected request to {url}')
    return urlopen


def hosts(calls):
    return [urlparse(c.full_url).hostname for c in calls]


def make_doctor(phone='+919300000001', name='Asha Rao', reg='2001123450', council='MAH', **extra):
    account = Account.objects.create_user(phone, role=Account.Role.DOCTOR)
    return Doctor.objects.create(
        account=account, full_name=name, specialization='Paediatrics', clinic_name='Kids',
        clinic_address='4 Park St', booking_phone_number='+917312345678',
        registration_number=reg, state_council_id=council, **extra,
    )


def client_for(account):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(account).access_token))
    return client


class RegisterCheckTests(TestCase):
    def setUp(self):
        cache.clear()

    def check(self, doctor, urlopen, **kwargs):
        with mock.patch(URLOPEN, side_effect=urlopen), mock.patch(SLEEP):
            return apply_verification(doctor, **kwargs)

    def test_exact_match_goes_to_admin_never_auto_verified(self):
        doctor = self.check(make_doctor(), nmc([record()]))
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertEqual(doctor.nmc_result, 'found')
        self.assertEqual(doctor.nmc_name, 'ASHA KRISHNA RAO')
        self.assertEqual(doctor.nmc_qualification, 'MBBS 2001')
        self.assertEqual(str(doctor.nmc_registration_date), '2001-12-19')
        self.assertEqual(doctor.name_match_score, 1.0)
        self.assertFalse(doctor.nmc_suspended)

    def test_substring_false_positive_is_filtered_out(self):
        # NMC matches by substring: "12345" also returns 2001123450.
        doctor = self.check(make_doctor(reg='12345'), nmc([record()]))
        self.assertEqual(doctor.nmc_result, 'not_found')

    def test_same_number_in_another_council_is_ignored(self):
        other = record(state_code='DEL', state_medical_council='Delhi Medical Council')
        doctor = self.check(make_doctor(), nmc([other]))
        self.assertEqual(doctor.nmc_result, 'not_found')

    def test_name_mismatch_is_flagged_for_the_admin(self):
        doctor = self.check(make_doctor(name='Rahul Verma'), nmc([record()]))
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertLess(doctor.name_match_score, 0.85)

    def test_not_found_goes_to_admin_not_rejected(self):
        doctor = self.check(make_doctor(), nmc([]))
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertEqual(doctor.nmc_result, 'not_found')
        self.assertIn('No registration 2001123450 found in Maharashtra Medical Council', doctor.nmc_remarks)

    def test_removed_doctor_is_flagged(self):
        removed = record(removed_status='1', removed_on='2018-04-02 00:00:00',
                         restored_on='1900-01-01 00:00:00', remarks='Order 86')
        doctor = self.check(make_doctor(), nmc([record()], blacklist_rows=[removed]))
        self.assertTrue(doctor.nmc_suspended)
        self.assertIn('02 Apr 2018', doctor.nmc_remarks)
        self.assertIn('Order 86', doctor.nmc_remarks)
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)

    def test_restored_entry_is_not_treated_as_removed(self):
        restored = record(removed_status='1', removed_on='2018-04-02 00:00:00', restored_on='2019-06-01 00:00:00')
        doctor = self.check(make_doctor(), nmc([record()], blacklist_rows=[restored]))
        self.assertFalse(doctor.nmc_suspended)

    def test_nmc_500_then_success_on_retry(self):
        calls = {'n': 0}
        good = nmc([record()])

        def flaky(request, timeout=None, context=None):
            if 'black-list' not in request.full_url:
                calls['n'] += 1
                if calls['n'] == 1:
                    raise http_error(500)
            return good(request, timeout, context)

        doctor = self.check(make_doctor(), flaky, attempts=3)
        self.assertEqual(doctor.nmc_result, 'found')
        self.assertEqual(calls['n'], 2)

    def test_4xx_is_not_retried(self):
        calls = {'n': 0}

        def gone(request, timeout=None, context=None):
            calls['n'] += 1
            raise http_error(404)

        doctor = self.check(make_doctor(), gone, attempts=3)
        self.assertEqual(calls['n'], 1)
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.FAILED)

    def test_timeouts_mark_failed_and_keep_the_reason(self):
        def timeout(request, timeout=None, context=None):
            raise urllib.error.URLError(socket.timeout('timed out'))

        doctor = self.check(make_doctor(), timeout, attempts=3)
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.FAILED)
        self.assertEqual(doctor.nmc_result, 'unavailable')
        self.assertIn('timed out', doctor.last_verification_error)

    def test_personal_fields_are_never_stored(self):
        doctor = self.check(make_doctor(), nmc([record()]))
        stored = json.dumps(doctor.nmc_payload)
        for personal in ('dob', 'father_name', 'permanent_address', '01-01-1975', 'Private Street', 'SOMEONE'):
            self.assertNotIn(personal, stored)
        self.assertEqual(doctor.nmc_payload['additional_qualifications'],
                         [{'qualification': 'MD', 'year': '2005', 'university': 'MUHS'}])

    def test_a_verified_doctor_stays_verified_unless_removed(self):
        doctor = make_doctor(verification_status=Doctor.VerificationStatus.VERIFIED)
        doctor = self.check(doctor, nmc([]), use_cache=False)  # not found any more
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.VERIFIED)

        removed = record(removed_status='1', removed_on='2026-01-01 00:00:00', restored_on='1900-01-01 00:00:00')
        doctor = self.check(doctor, nmc([removed], blacklist_rows=[removed]), use_cache=False)
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertTrue(doctor.nmc_suspended)

    def test_a_rejected_doctor_is_not_changed_by_a_recheck(self):
        doctor = make_doctor(verification_status=Doctor.VerificationStatus.REJECTED)
        doctor = self.check(doctor, nmc([record()]))
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.REJECTED)

    def test_found_results_are_cached_failures_are_not(self):
        doctor = self.check(make_doctor(), nmc([record()]))
        with mock.patch(URLOPEN, side_effect=AssertionError('should come from the cache')):
            apply_verification(doctor)
        cache.clear()

        def down(request, timeout=None, context=None):
            raise urllib.error.URLError('down')

        other = self.check(make_doctor(phone='+919300000002', reg='777'), down, attempts=1)
        self.assertEqual(other.nmc_result, 'unavailable')
        with mock.patch(URLOPEN, side_effect=nmc([record(registration_no='777')])):
            other = apply_verification(other)
        self.assertEqual(other.nmc_result, 'found')

    def test_name_matching_handles_indian_name_order_and_initials(self):
        self.assertEqual(compute_name_match('Dr. Asha Rao', 'ASHA KRISHNA RAO'), 1.0)
        self.assertEqual(compute_name_match('Rao Asha', 'ASHA RAO'), 1.0)
        self.assertEqual(compute_name_match('A. K. Sharma', 'ANIL KUMAR SHARMA'), 1.0)
        self.assertLess(compute_name_match('Rahul Verma', 'ASHA KRISHNA RAO'), 0.5)


class RegistrationFlowTests(TestCase):
    """The journey through the API: register, admin queue, Find Care."""

    def setUp(self):
        cache.clear()
        self.account = Account.objects.create_user('+919300000010')
        self.api = client_for(self.account)

    def register(self, **extra):
        body = {
            'full_name': 'Dr. Asha Rao', 'specialization': 'Paediatrics', 'qualification': 'MBBS',
            'experience_years': 6, 'clinic_name': 'Kids', 'registration_number': ' 2001123450 ',
            'state_council_id': 'MAH', 'registration_year': 2001,
            'clinic_address': '4 Park St', 'booking_phone_number': '+917312345678',
        }
        body.update(extra)
        return self.api.post('/api/doctors/', {k: v for k, v in body.items() if v is not None}, format='multipart')

    def test_registration_checks_the_register_and_lands_in_review(self):
        with mock.patch(URLOPEN, side_effect=nmc([record()])):
            response = self.register()
        self.assertEqual(response.status_code, 201, response.data)
        doctor = Doctor.objects.get(account=self.account)
        self.assertEqual(doctor.registration_number, '2001123450')
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertEqual(doctor.nmc_result, 'found')

    def test_registration_succeeds_when_the_register_times_out(self):
        with mock.patch(URLOPEN, side_effect=urllib.error.URLError(socket.timeout('timed out'))), \
                mock.patch(SLEEP):
            response = self.register()
        self.assertEqual(response.status_code, 201, response.data)
        doctor = Doctor.objects.get(account=self.account)
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.FAILED)

    def test_current_forms_must_send_consent_and_the_year(self):
        response = self.register(verification_consent='false')
        self.assertEqual(response.status_code, 400)
        self.assertIn('verification_consent', response.data)
        response = self.register(verification_consent='true', registration_year=None)
        self.assertEqual(response.status_code, 400)
        self.assertIn('registration_year', response.data)
        self.assertFalse(Doctor.objects.exists())

        with mock.patch(URLOPEN, side_effect=nmc([record()])):
            response = self.register(verification_consent='true')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNotNone(Doctor.objects.get(account=self.account).verification_consent_at)
        self.assertNotIn('verification_consent', response.data)

    def test_older_apps_without_the_consent_box_still_register(self):
        with mock.patch(URLOPEN, side_effect=nmc([record()])):
            response = self.register(registration_year=None)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(Doctor.objects.get(account=self.account).verification_consent_at)

    @override_settings(**APIFY_ON, **DECENTRO_ON)
    def test_sign_up_asks_only_nmc_even_with_fallbacks_configured(self):
        calls = []
        with mock.patch(URLOPEN, side_effect=services(nmc_rows=None, apify=[apify_item()], decentro=decentro_found(),
                                                      calls=calls)), mock.patch(SLEEP):
            response = self.register(verification_consent='true')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(set(hosts(calls)), {'nmc.org.in'})
        doctor = Doctor.objects.get(account=self.account)
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.FAILED)
        self.assertEqual([(a['provider'], a['result']) for a in doctor.provider_attempts], [('nmc', 'unavailable')])

    def test_registration_succeeds_even_if_the_check_crashes(self):
        with mock.patch('doctors.services.verification.apply_verification', side_effect=RuntimeError('boom')):
            response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Doctor.objects.get(account=self.account).verification_status, 'pending')

    def test_older_apps_without_a_council_still_register(self):
        with mock.patch(URLOPEN, side_effect=AssertionError('nothing to look up')):
            response = self.register(state_council_id=None, registration_year=None)
        self.assertEqual(response.status_code, 201, response.data)
        doctor = Doctor.objects.get(account=self.account)
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertIn('No registration number and medical council', doctor.last_verification_error)

    def test_duplicate_registration_number_in_the_same_council_is_refused(self):
        make_doctor(phone='+919300000011', reg='2001123450', council='MAH')
        response = self.register(registration_number='2001123450')
        self.assertEqual(response.status_code, 400)
        self.assertIn('already registered', str(response.data['registration_number']))
        # The same number in another council is a different registration.
        with mock.patch(URLOPEN, side_effect=nmc([])):
            response = self.register(state_council_id='DEL')
        self.assertEqual(response.status_code, 201, response.data)

    def test_find_care_lists_verified_doctors_only(self):
        for i, status in enumerate(['pending', 'manual_review', 'failed', 'rejected', 'verified']):
            make_doctor(phone=f'+91930000002{i}', reg=f'R{i}', name=f'Doctor {status}', verification_status=status)
        patient = client_for(Account.objects.create_user('+919300000030'))
        names = [d['full_name'] for d in patient.get('/api/doctors/').data['results']]
        self.assertEqual(names, ['Doctor verified'])

    def test_correcting_details_after_rejection_goes_back_to_review(self):
        with mock.patch(URLOPEN, side_effect=nmc([record()])):
            self.register()
        doctor = Doctor.objects.get(account=self.account)
        doctor.verification_status, doctor.rejection_reason = 'rejected', 'Wrong council'
        doctor.save()

        cache.clear()
        with mock.patch(URLOPEN, side_effect=nmc([record(state_code='DEL', state_medical_council='Delhi Medical Council')])):
            response = self.api.patch('/api/doctors/me/', {'state_council_id': 'DEL'}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['verification_status'], 'manual_review')
        self.assertEqual(response.data['rejection_reason'], '')
        self.assertEqual(response.data['nmc_result'], 'found')

    def test_precheck_reports_the_register_answer(self):
        with mock.patch(URLOPEN, side_effect=nmc([record()])):
            response = self.api.post('/api/doctors/verify-registration/', {
                'registration_number': '2001123450', 'state_council_id': 'MAH', 'full_name': 'Asha Rao',
            }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'found')
        self.assertEqual(response.data['nmc_name'], 'ASHA KRISHNA RAO')
        self.assertTrue(response.data['name_matches'])
        # What the form fills in: no personal fields, the name as people write it.
        self.assertEqual(response.data['prefill'], {
            'full_name': 'Asha Krishna Rao', 'qualification': 'MBBS, MD',
            'registration_year': 2001, 'experience_years': timezone.localdate().year - 2001,
        })

        with mock.patch(URLOPEN, side_effect=urllib.error.URLError('down')):
            response = self.api.post('/api/doctors/verify-registration/', {
                'registration_number': '999', 'state_council_id': 'MAH',
            }, format='json')
        self.assertEqual(response.data['status'], 'unavailable')
        self.assertIn("couldn't reach the medical register", response.data['message'])
        self.assertIsNone(response.data['prefill'])

    def test_precheck_prefill_tidies_the_register_entry(self):
        row = record(
            name='DR.  MEERA   IYER', year_of_info=None, registration_date='',
            additional_qualifications=[{'qualification': 'mbbs'}, {'qualification': 'MS (Ortho)'}],
        )
        with mock.patch(URLOPEN, side_effect=nmc([row])):
            response = self.api.post('/api/doctors/verify-registration/', {
                'registration_number': '2001123450', 'state_council_id': 'MAH',
            }, format='json')
        self.assertEqual(response.data['prefill'], {'full_name': 'Meera Iyer', 'qualification': 'MBBS, MS (Ortho)'})

        cache.clear()
        with mock.patch(URLOPEN, side_effect=nmc([])):
            response = self.api.post('/api/doctors/verify-registration/', {
                'registration_number': '2001123450', 'state_council_id': 'MAH',
            }, format='json')
        self.assertEqual(response.data['status'], 'not_found')
        self.assertIsNone(response.data['prefill'])

    def test_precheck_points_to_the_council_the_number_is_under(self):
        row = record(registration_no='110324', state_code='TAM',
                     state_medical_council='Tamil Nadu Medical Council', year_of_info=2015)
        with mock.patch(URLOPEN, side_effect=nmc([row])):
            response = self.api.post('/api/doctors/verify-registration/', {
                'registration_number': '110324', 'state_council_id': 'DEL',
            }, format='json')
        self.assertEqual(response.data['status'], 'not_found')
        self.assertIn('listed under Tamil Nadu Medical Council (2015)', response.data['message'])
        self.assertEqual(response.data['other_councils'], [
            {'state_council_id': 'TAM', 'state_council_name': 'Tamil Nadu Medical Council', 'year': 2015},
        ])

    def test_precheck_needs_sign_in_and_is_throttled(self):
        self.assertEqual(APIClient().post('/api/doctors/verify-registration/', {}).status_code, 401)
        rates = {**SimpleRateThrottle.THROTTLE_RATES, 'nmc_precheck': '2/min'}
        with mock.patch.object(SimpleRateThrottle, 'THROTTLE_RATES', rates), \
                mock.patch(URLOPEN, side_effect=nmc([])):
            codes = [
                self.api.post('/api/doctors/verify-registration/',
                              {'registration_number': str(n), 'state_council_id': 'MAH'}, format='json').status_code
                for n in range(3)
            ]
        cache.clear()
        self.assertEqual(codes, [200, 200, 429])


@override_settings(ADMIN_PHONE_NUMBERS=[ADMIN_PHONE])
class AdminQueueTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = Account.objects.create_user(ADMIN_PHONE, role=Account.Role.ADMIN)
        self.api = client_for(self.admin)
        self.doctor = make_doctor(verification_status=Doctor.VerificationStatus.MANUAL_REVIEW)

    def test_queue_lists_doctors_waiting_for_a_decision(self):
        make_doctor(phone='+919300000040', reg='V1', verification_status='verified')
        response = self.api.get('/api/admin/doctors/verification-queue/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([d['id'] for d in response.data['results']], [str(self.doctor.id)])
        response = self.api.get('/api/admin/doctor-verification/', {'status': 'verified'})
        self.assertEqual(len(response.data['results']), 1)

    def test_approve_records_who_and_when(self):
        response = self.api.post(f'/api/admin/doctors/{self.doctor.id}/approve/')
        self.assertEqual(response.status_code, 200)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.verification_status, 'verified')
        self.assertEqual(self.doctor.verified_by, self.admin)
        self.assertIsNotNone(self.doctor.verified_at)

    def test_reject_keeps_the_reason_for_the_doctor(self):
        response = self.api.post(f'/api/admin/doctors/{self.doctor.id}/reject/', {'reason': 'Number belongs to someone else'})
        self.assertEqual(response.status_code, 200)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.verification_status, 'rejected')
        self.assertEqual(self.doctor.rejection_reason, 'Number belongs to someone else')
        doctor_view = client_for(self.doctor.account).get('/api/doctors/me/')
        self.assertEqual(doctor_view.data['rejection_reason'], 'Number belongs to someone else')

    def test_older_admin_apps_can_still_reject_without_a_reason(self):
        response = self.api.post(f'/api/admin/doctor-verification/{self.doctor.id}/reject/')
        self.assertEqual(response.status_code, 200)
        self.doctor.refresh_from_db()
        self.assertTrue(self.doctor.rejection_reason)

    def test_reverify_asks_the_register_again(self):
        with mock.patch(URLOPEN, side_effect=nmc([record()])):
            response = self.api.post(f'/api/admin/doctors/{self.doctor.id}/reverify/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['nmc_result'], 'found')
        self.assertEqual(response.data['verification_status'], 'manual_review')
        self.assertTrue(response.data['name_matches'])
        self.assertEqual([a['provider'] for a in response.data['provider_attempts']], ['nmc'])

    def test_only_admins_can_decide(self):
        for account in (self.doctor.account, Account.objects.create_user('+919300000050'),
                        Account.objects.create_user('+919300000051', role=Account.Role.ADMIN)):  # not allow-listed
            api = client_for(account)
            self.assertEqual(api.post(f'/api/admin/doctors/{self.doctor.id}/approve/').status_code, 403)
            self.assertEqual(api.post(f'/api/admin/doctors/{self.doctor.id}/reject/').status_code, 403)
            self.assertEqual(api.get('/api/admin/doctors/verification-queue/').status_code, 403)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.verification_status, 'manual_review')

    def test_status_cannot_be_patched_around_the_audited_actions(self):
        response = self.api.patch(f'/api/admin/doctors/{self.doctor.id}/', {'verification_status': 'verified'}, format='json')
        self.assertEqual(response.status_code, 405)


@override_settings(**ALL_OFF)
class ProviderChainTests(TestCase):
    """NMC first, then the outside fallbacks — as `reverify_doctors` runs them."""

    def setUp(self):
        cache.clear()

    def check(self, doctor, urlopen, **kwargs):
        kwargs.setdefault('providers', FULL)
        with mock.patch(URLOPEN, side_effect=urlopen), mock.patch(SLEEP):
            return apply_verification(doctor, use_cache=False, **kwargs)

    def consenting(self, **extra):
        extra.setdefault('registration_year', 2001)
        return make_doctor(verification_consent_at=timezone.now(), **extra)

    @staticmethod
    def trail(doctor):
        return [(a['provider'], a['result']) for a in doctor.provider_attempts]

    # -- NMC's own register ------------------------------------------------

    def test_council_prefix_on_the_register_still_matches(self):
        row = record(registration_no='DMC/R/11030', state_code='DEL', state_medical_council='Delhi Medical Council')
        doctor = self.check(make_doctor(reg='11030', council='DEL'), services(nmc_rows=[row]))
        self.assertEqual(doctor.nmc_result, 'found')
        self.assertTrue(same_number('05892', '5892'))
        self.assertTrue(same_number('5892', 'MCI-5892'))
        self.assertTrue(same_number('APMC/FMR/110324', '110324'))
        self.assertFalse(same_number('11030', 'DMC/R/111030'))
        self.assertFalse(same_number('A-11030', 'B-11030'))
        self.assertFalse(same_number('5892', '15892'))

    def test_not_found_names_the_council_the_number_is_under(self):
        row = record(registration_no='110324', state_code='TAM',
                     state_medical_council='Tamil Nadu Medical Council', year_of_info=2015)
        doctor = self.check(make_doctor(reg='110324', council='DEL'), services(nmc_rows=[row]))
        self.assertEqual(doctor.nmc_result, 'not_found')
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertIn('listed under Tamil Nadu Medical Council (2015)', doctor.nmc_remarks)
        self.assertEqual(doctor.nmc_payload['other_councils'][0]['council'], 'TAM')

    def test_exact_match_behind_substring_matches_is_found_on_a_later_page(self):
        pages = {1: [record(registration_no='15892', name='SOMEONE ELSE')], 2: [record(registration_no='5892')]}

        def urlopen(request, timeout=None, context=None):
            page = int(parse_qs(urlparse(request.full_url).query)['page'][0])
            rows = [] if 'black-list' in request.full_url else pages.get(page, [])
            body = {'success': True, 'data': rows, 'pagination': {'total_pages': 2}}
            return FakeResponse(json.dumps(body).encode())

        doctor = self.check(make_doctor(reg='5892'), urlopen)
        self.assertEqual(doctor.nmc_result, 'found')
        self.assertEqual(doctor.nmc_name, 'ASHA KRISHNA RAO')

    def test_the_year_picks_between_entries_sharing_a_number(self):
        rows = [record(name='SINGH KIRAN', year_of_info=1984), record(name='KHARE RUCHIR', year_of_info=2003)]
        with mock.patch(URLOPEN, side_effect=services(nmc_rows=rows)):
            self.assertEqual(verify_registration('2001123450', 'MAH').status, 'ambiguous')
            self.assertEqual(verify_registration('2001123450', 'MAH', 2003).name, 'KHARE RUCHIR')
            # Cached per year: 1984 is not answered with 2003's entry.
            self.assertEqual(verify_registration('2001123450', 'MAH', 1984).name, 'SINGH KIRAN')

    # -- the chain ---------------------------------------------------------

    @override_settings(**APIFY_ON)
    def test_nmc_unreachable_then_apify_finds_it(self):
        calls = []
        doctor = self.check(self.consenting(), services(nmc_rows=None, apify=[apify_item()], calls=calls), attempts=1)
        self.assertEqual(doctor.nmc_result, 'found')
        self.assertEqual(doctor.verification_provider, 'apify')
        self.assertEqual(doctor.nmc_name, 'ASHA KRISHNA RAO')
        self.assertEqual(doctor.nmc_registration_date.isoformat(), '2001-12-19')
        # Found is evidence for the admin, not a verification.
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertEqual(self.trail(doctor), [('nmc', 'unavailable'), ('apify', 'found')])
        # Token in a header, never the URL; personal fields never stored.
        request = next(c for c in calls if 'apify.com' in c.full_url)
        self.assertEqual(request.get_header('Authorization'), 'Bearer apify-test-token')
        self.assertNotIn('token', request.full_url)
        body = json.loads(request.data)
        self.assertEqual(body['registrationId'], '2001123450')
        self.assertEqual(body['stateMedicalCouncil'], 'Maharashtra Medical Council')
        for key in ('dateOfBirth', 'address', 'uprnNo', 'parentName'):
            self.assertNotIn(key, doctor.nmc_payload)

    @override_settings(**APIFY_ON)
    def test_apify_removed_is_recorded_as_suspended(self):
        doctor = self.check(self.consenting(), services(nmc_rows=None, apify=[apify_item('removed')]), attempts=1)
        self.assertEqual(doctor.nmc_result, 'found')
        self.assertTrue(doctor.nmc_suspended)
        self.assertEqual(self.trail(doctor)[-1], ('apify', 'suspended'))
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)

    @override_settings(**APIFY_ON)
    def test_apify_status_mapping(self):
        q = Lookup(reg_no='2001123450', council='MAH')
        expected = {'valid': 'found', 'restored': 'found', 'removed': 'found', 'not_found': 'not_found',
                    'ambiguous': 'ambiguous', 'error': 'unavailable', 'candidate': 'unavailable'}
        for status, result in expected.items():
            with mock.patch(URLOPEN, side_effect=services(apify=[apify_item(status)])):
                self.assertEqual(ApifyProvider().verify(q).status, result, status)
        with mock.patch(URLOPEN, side_effect=services(apify=[])):
            self.assertEqual(ApifyProvider().verify(q).status, 'unavailable')

    @override_settings(**DECENTRO_ON)
    def test_decentro_request_and_match(self):
        calls = []
        doctor = self.consenting()
        doctor = self.check(doctor, services(nmc_rows=None, decentro=decentro_found(), calls=calls), attempts=1)
        request = next(c for c in calls if 'decentro' in c.full_url)
        self.assertEqual(request.full_url, 'https://in.staging.decentro.tech/v2/kyc/professional-verification/nmc')
        self.assertEqual(request.get_header('Client_id'), 'cid')
        self.assertEqual(request.get_header('Client_secret'), 'secret')
        body = json.loads(request.data)
        self.assertGreater(len(body['purpose']), 20)
        self.assertIs(body['consent'], True)
        self.assertEqual(
            {k: body[k] for k in ('member_id', 'state_council', 'year_of_admission', 'member_name')},
            {'member_id': '2001123450', 'state_council': 'Maharashtra Medical Council',
             'year_of_admission': '2001', 'member_name': 'Asha Rao'},
        )
        self.assertTrue(body['reference_id'].startswith(f'cp-doc-{doctor.pk}-'))

        self.assertEqual(doctor.nmc_result, 'found')
        self.assertEqual(doctor.verification_provider, 'decentro')
        self.assertEqual(doctor.nmc_name, 'ASHA KRISHNA RAO')
        self.assertEqual(doctor.nmc_payload['decentroTxnId'], 'TXN1')
        self.assertNotIn('address', doctor.nmc_payload)
        self.assertNotIn('parentName', doctor.nmc_payload)

    @override_settings(**DECENTRO_ON)
    def test_decentro_no_record_is_not_found_and_errors_are_unavailable(self):
        doctor = self.check(self.consenting(), services(nmc_rows=None, decentro=DECENTRO_NO_RECORD), attempts=1)
        self.assertEqual(doctor.nmc_result, 'not_found')
        self.assertEqual(doctor.verification_provider, 'decentro')
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)

        broken = (500, {'status': 'FAILURE', 'responseKey': 'error_internal'})
        other = self.check(self.consenting(phone='+919300000002', reg='777'),
                           services(nmc_rows=None, decentro=broken), attempts=1)
        self.assertEqual(other.nmc_result, 'unavailable')
        self.assertEqual(other.verification_status, Doctor.VerificationStatus.FAILED)
        self.assertIn('decentro', other.last_verification_error)

    @override_settings(**APIFY_ON, **DECENTRO_ON)
    def test_one_source_not_finding_it_goes_to_admin_review(self):
        doctor = self.check(self.consenting(), services(nmc_rows=[], apify=None, decentro=None), attempts=1)
        self.assertEqual(self.trail(doctor),
                         [('nmc', 'not_found'), ('apify', 'unavailable'), ('decentro', 'unavailable')])
        self.assertEqual(doctor.nmc_result, 'not_found')
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)

    @override_settings(**APIFY_ON, **DECENTRO_ON)
    def test_every_source_not_finding_it_still_leaves_the_decision_to_an_admin(self):
        doctor = self.check(self.consenting(), services(
            nmc_rows=[], apify=[apify_item('not_found')], decentro=DECENTRO_NO_RECORD), attempts=1)
        self.assertEqual(self.trail(doctor),
                         [('nmc', 'not_found'), ('apify', 'not_found'), ('decentro', 'not_found')])
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)
        self.assertIn('checked: NMC register, Apify NMC lookup, Decentro', doctor.nmc_remarks)

    @override_settings(**APIFY_ON, **DECENTRO_ON)
    def test_the_chain_stops_at_the_first_answer(self):
        calls = []
        doctor = self.check(self.consenting(), services(nmc_rows=[record()], apify=[apify_item()],
                                                        decentro=decentro_found(), calls=calls))
        self.assertEqual(self.trail(doctor), [('nmc', 'found')])
        self.assertEqual(set(hosts(calls)), {'nmc.org.in'})

    def test_unconfigured_providers_are_skipped(self):
        calls = []
        doctor = self.check(self.consenting(), services(nmc_rows=None, calls=calls), attempts=1)
        self.assertEqual(set(hosts(calls)), {'nmc.org.in'})
        self.assertEqual(self.trail(doctor), [('nmc', 'unavailable')])
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.FAILED)

    @override_settings(**APIFY_ON, **DECENTRO_ON)
    def test_outside_partners_need_consent_and_decentro_the_year(self):
        calls = []
        doctor = self.check(make_doctor(), services(nmc_rows=None, apify=[apify_item()],
                                                    decentro=decentro_found(), calls=calls), attempts=1)
        self.assertEqual(set(hosts(calls)), {'nmc.org.in'})
        self.assertEqual(self.trail(doctor), [('nmc', 'unavailable'), ('apify', 'skipped'), ('decentro', 'skipped')])

        no_year = self.consenting(phone='+919300000002', reg='777', registration_year=None)
        no_year = self.check(no_year, services(nmc_rows=None, apify=[apify_item('not_found')]), attempts=1)
        self.assertEqual(self.trail(no_year), [('nmc', 'unavailable'), ('apify', 'not_found'), ('decentro', 'skipped')])
        self.assertIn('year', no_year.provider_attempts[-1]['reason'])

    @override_settings(DOCTOR_VERIFY_PROVIDERS=['decentro', 'nmc'], **DECENTRO_ON)
    def test_order_follows_the_setting(self):
        doctor = self.check(self.consenting(), services(nmc_rows=[record()], decentro=DECENTRO_NO_RECORD))
        self.assertEqual(self.trail(doctor), [('decentro', 'not_found'), ('nmc', 'found')])

    def test_personal_fields_are_stripped_at_any_depth(self):
        self.assertEqual(
            strip_pii({'a': 1, 'address': 'x', 'uprnNo': 'u', 'nested': [{'dob': '1', 'b': 2, 'Email': 'e'}]}),
            {'a': 1, 'nested': [{'b': 2}]},
        )
        doctor = self.check(make_doctor(), services(nmc_rows=[record()]))
        for key in ('dob', 'father_name', 'permanent_address', 'uprn_no'):
            self.assertNotIn(key, doctor.nmc_payload)

    # -- the background job -------------------------------------------------

    @override_settings(**APIFY_ON)
    def test_reverify_job_asks_the_fallbacks_once_about_not_found_doctors(self):
        doctor = self.check(self.consenting(), services(nmc_rows=[]), providers=('nmc',))
        self.assertEqual(self.trail(doctor), [('nmc', 'not_found')])
        unconsented = self.check(make_doctor(phone='+919300000002', reg='777'), services(nmc_rows=[]),
                                 providers=('nmc',))

        calls = []
        with mock.patch(URLOPEN, side_effect=services(nmc_rows=[], apify=[apify_item('not_found')], calls=calls)):
            call_command('reverify_doctors', pause=0, stdout=io.StringIO())
        self.assertEqual(hosts(calls).count('api.apify.com'), 1)
        doctor.refresh_from_db()
        unconsented.refresh_from_db()
        self.assertEqual(self.trail(doctor), [('nmc', 'not_found'), ('apify', 'not_found')])
        self.assertEqual(self.trail(unconsented), [('nmc', 'not_found')])
        self.assertEqual(doctor.verification_status, Doctor.VerificationStatus.MANUAL_REVIEW)

        calls.clear()
        with mock.patch(URLOPEN, side_effect=services(nmc_rows=[], apify=[apify_item('not_found')], calls=calls)):
            call_command('reverify_doctors', pause=0, stdout=io.StringIO())
        self.assertEqual(calls, [])  # nothing left to ask
