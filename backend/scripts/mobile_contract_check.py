"""
Exercises every endpoint the mobile client calls, using the same URLs and
payload keys src/lib/api.ts uses, and checks the fields the screens read.

The point is to catch a contract mismatch (a renamed field, a different
shape) here rather than as a blank screen on a phone.
"""

import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

import warnings
warnings.filterwarnings('ignore')

from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account
from doctors.models import Doctor, DoctorPatientAccess
from family.models import Profile

PASS, FAIL = [], []


def check(name, condition, detail=''):
    (PASS if condition else FAIL).append(name)
    mark = 'PASS' if condition else 'FAIL'
    print(f'[{mark}] {name}' + (f'  <- {detail}' if detail and not condition else ''))


def rows(response):
    data = response.data
    if isinstance(data, list):
        return data
    return (data or {}).get('results', [])


def has_fields(obj, *fields):
    missing = [f for f in fields if f not in obj]
    return (not missing), f'missing {missing}'


# ---------------------------------------------------------------- patient
patient = Account.objects.get(phone_number='+919876500000')
# The seeded 'self' profile, not profiles.first(): Profile.Meta orders
# by '-relation', so any dependent added later (a 'son', say) sorts
# ahead of it and would be checked instead — and it has no records.
profile = patient.profiles.filter(relation='self').first() or patient.profiles.first()
pc = APIClient()
pc.credentials(HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(patient).access_token))

print('\n=== PATIENT ===')

r = pc.get('/api/auth/me/')
ok, why = has_fields(r.data, 'id', 'phone_number', 'role')
check('GET /api/auth/me/ returns id, phone_number, role', r.status_code == 200 and ok, why)

r = pc.get('/api/profiles/')
profiles = rows(r)
ok, why = has_fields(profiles[0], 'id', 'full_name', 'relation', 'initials', 'blood_group')
check('GET /api/profiles/ returns initials (ProfileSwitcher reads it)', r.status_code == 200 and ok, why)

pid = str(profile.id)

r = pc.get('/api/documents/', {'profile_id': pid})
docs = rows(r)
ok, why = has_fields(docs[0], 'id', 'title', 'category', 'status', 'document_date', 'hospital_name')
check('GET /api/documents/?profile_id= returns locker card fields', r.status_code == 200 and ok, why)

r = pc.get('/api/documents/', {'profile_id': pid, 'category': 'prescription'})
check('GET /api/documents/ filters by category', r.status_code == 200 and all(d['category'] == 'prescription' for d in rows(r)))

r = pc.get(f'/api/documents/{docs[0]["id"]}/')
ok, why = has_fields(r.data, 'file', 'structured_data', 'doctor_name', 'hospital_name')
check('GET /api/documents/<id>/ returns detail-screen fields', r.status_code == 200 and ok, why)

r = pc.get('/api/timeline/', {'profile_id': pid})
events = rows(r)
ok, why = has_fields(events[0], 'id', 'event_date', 'event_type', 'title', 'summary', 'source_document')
check('GET /api/timeline/?profile_id= returns timeline fields', r.status_code == 200 and ok, why)

r = pc.get('/api/medications/', {'profile_id': pid})
meds = rows(r)
ok, why = has_fields(meds[0], 'id', 'name', 'dosage', 'instructions', 'frequency', 'reminders')
check('GET /api/medications/ includes nested reminders', r.status_code == 200 and ok, why)

reminder_id = meds[0]['reminders'][0]['id'] if meds[0]['reminders'] else None
check('medication.reminders carries time_of_day', bool(reminder_id) and 'time_of_day' in meds[0]['reminders'][0])

r = pc.post('/api/dose-logs/', {'reminder': reminder_id, 'status': 'taken',
                                'scheduled_for': '2026-09-10T08:00:00Z'}, format='json')
check('POST /api/dose-logs/ marks a dose taken', r.status_code == 201, f'status {r.status_code} {r.data}')

r = pc.get('/api/dose-logs/', {'profile_id': pid})
logs = rows(r)
ok, why = has_fields(logs[0], 'reminder', 'status', 'scheduled_for')
check('GET /api/dose-logs/?profile_id= returns fields the "taken today" set needs', r.status_code == 200 and ok, why)

r = pc.get('/api/allergies/', {'profile_id': pid})
allergies = rows(r)
ok, why = has_fields(allergies[0], 'id', 'substance', 'reaction', 'kind')
check('GET /api/allergies/?profile_id= returns substance/reaction/kind', r.status_code == 200 and ok, why)

r = pc.get('/api/insurance/', {'profile_id': pid})
policies = rows(r)
ok, why = has_fields(policies[0], 'id', 'insurer', 'plan_name', 'status', 'sum_insured',
                     'co_payment_percent', 'exclusions', 'waiting_periods', 'sub_limits')
check('GET /api/insurance/?profile_id= returns nested exclusions/waiting/sub-limits', r.status_code == 200 and ok, why)

policy_id = policies[0]['id']
r = pc.get(f'/api/insurance/{policy_id}/chat/')
check('GET /api/insurance/<id>/chat/ returns history (not 405)', r.status_code == 200, f'status {r.status_code}')

r = pc.post(f'/api/insurance/{policy_id}/estimate/',
            {'claim_category': 'Knee surgery', 'estimated_bill': '150000'}, format='json')
ok, why = has_fields(r.data, 'eligible', 'estimated_insurer_share', 'estimated_out_of_pocket', 'reasoning_summary')
check('POST /api/insurance/<id>/estimate/ returns estimate fields', r.status_code == 201 and ok,
      f'status {r.status_code} {why}')

r = pc.post(f'/api/insurance/{policy_id}/confirm/')
check('POST /api/insurance/<id>/confirm/ validates the policy',
      r.status_code == 200 and r.data['status'] == 'validated', f'status {r.status_code}')

r = pc.get('/api/notifications/', {'profile_id': pid})
check('GET /api/notifications/?profile_id= responds', r.status_code == 200, f'status {r.status_code}')

r = pc.get('/api/emergency-qr/')
cards = rows(r)
ok, why = has_fields(cards[0], 'id', 'profile', 'public_token', 'is_active',
                     'include_blood_group', 'include_allergies', 'include_medications',
                     'include_emergency_contact')
check('GET /api/emergency-qr/ returns profile + toggles (mobile filters by profile)', r.status_code == 200 and ok, why)

r = pc.get('/api/doctor-access/', {'profile_id': pid})
check('GET /api/doctor-access/?profile_id= responds', r.status_code == 200)

r = pc.get('/api/doctors/')
doctors = rows(r)
ok, why = has_fields(doctors[0], 'id', 'full_name', 'specialization', 'verification_status',
                     'booking_phone_number', 'available_days', 'clinic_open_time', 'clinic_address')
check('GET /api/doctors/ returns Find Care card fields', r.status_code == 200 and ok, why)

# ---------------------------------------------------------------- doctor
print('\n=== DOCTOR ===')
doctor = Doctor.objects.filter(verification_status='verified').first()
if not doctor:
    doctor = Doctor.objects.first()
    doctor.verification_status = 'verified'
    doctor.save()

dc = APIClient()
dc.credentials(HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(doctor.account).access_token))

r = dc.get('/api/doctors/me/')
ok, why = has_fields(r.data, 'id', 'full_name', 'verification_status', 'available_days',
                     'clinic_open_time', 'clinic_close_time', 'registration_number')
check('GET /api/doctors/me/ returns the doctor profile screen fields', r.status_code == 200 and ok, why)

r = dc.patch('/api/doctors/availability/',
             {'available_days': ['Monday', 'Wednesday'], 'clinic_open_time': '09:00',
              'clinic_close_time': '17:00'}, format='json')
check('PATCH /api/doctors/availability/ saves clinic hours', r.status_code == 200, f'status {r.status_code} {r.data}')

grant, _ = DoctorPatientAccess.objects.get_or_create(doctor=doctor, profile=profile)
grant.status = DoctorPatientAccess.Status.APPROVED
grant.save()

r = dc.get('/api/doctor-access/')
check('GET /api/doctor-access/ lists the doctor own grants', r.status_code == 200 and len(rows(r)) > 0)

r = dc.get('/api/profiles/')
names = {p['id']: p['full_name'] for p in rows(r)}
check('GET /api/profiles/ exposes approved patient names to the doctor', pid in names, f'got {list(names)}')

r = dc.get('/api/medications/', {'profile_id': pid})
med_rows = rows(r)
check('doctor sees approved patient medications', r.status_code == 200 and len(med_rows) > 0)
check('doctor medication serializer omits personal reminder schedule',
      med_rows and 'reminders' not in med_rows[0], f'got keys {list(med_rows[0]) if med_rows else []}')

r = dc.get('/api/allergies/', {'profile_id': pid})
check('doctor sees approved patient allergies', r.status_code == 200 and len(rows(r)) > 0)

r = dc.post('/api/consultation-notes/',
            {'profile': pid, 'diagnosis': 'Contract check', 'prescription': 'n/a', 'notes': 'n/a'},
            format='json')
check('POST /api/consultation-notes/ succeeds for an approved patient', r.status_code == 201,
      f'status {r.status_code} {r.data}')

r = dc.post('/api/medications/', {'profile': pid, 'name': 'Doctor should not add this'}, format='json')
check('doctor is still blocked from writing patient medications', r.status_code == 403, f'status {r.status_code}')

# ---------------------------------------------------------------- admin
print('\n=== ADMIN ===')
admin = Account.objects.filter(role=Account.Role.ADMIN).first()
ac = APIClient()
ac.credentials(HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(admin).access_token))

r = ac.get('/api/admin/dashboard/summary/')
ok, why = has_fields(r.data, 'total_users', 'documents_needing_review',
                     'policies_needing_review', 'doctor_verification_queue')
check('GET /api/admin/dashboard/summary/ returns all four counters', r.status_code == 200 and ok, why)

r = ac.get('/api/admin/documents/', {'status': 'needs_review'})
check('GET /api/admin/documents/?status= responds', r.status_code == 200)

r = ac.get('/api/admin/insurance-policies/')
check('GET /api/admin/insurance-policies/ responds', r.status_code == 200)

r = ac.get('/api/admin/doctor-verification/')
vdocs = rows(r)
ok, why = has_fields(vdocs[0], 'id', 'full_name', 'registration_number', 'account_phone_number',
                     'booking_phone_number', 'license_document', 'verification_status')
check('GET /api/admin/doctor-verification/ returns verification fields', r.status_code == 200 and ok, why)

r = ac.get('/api/admin/patients/')
prow = rows(r)
ok, why = has_fields(prow[0], 'id', 'full_name', 'relation', 'account_phone_number', 'created_at')
check('GET /api/admin/patients/ returns directory fields', r.status_code == 200 and ok, why)

r = ac.get('/api/admin/accounts/')
arow = rows(r)
ok, why = has_fields(arow[0], 'id', 'phone_number', 'role', 'is_active', 'date_joined')
check('GET /api/admin/accounts/ returns account fields', r.status_code == 200 and ok, why)

r = ac.get('/api/admin/audit-log/')
check('GET /api/admin/audit-log/ responds', r.status_code == 200)

# ---------------------------------------------------------------- public
print('\n=== PUBLIC EMERGENCY CARD ===')
from django.test import Client
token = cards[0]['public_token']
pub = Client().get(f'/api/public/emergency/{token}/?format=json')
check('public emergency card is readable with no auth', pub.status_code == 200, f'status {pub.status_code}')
check('public card exposes only allow-listed keys',
      set(pub.json()) <= {'name', 'blood_group', 'allergies', 'medications',
                          'emergency_contact_name', 'emergency_contact_phone'},
      f'got {set(pub.json())}')

print(f'\n{len(PASS)} passed, {len(FAIL)} failed')
if FAIL:
    print('FAILED:')
    for f in FAIL:
        print('  -', f)
