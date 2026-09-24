"""
End-to-end test of every flow the mobile app performs, over real HTTP
against a running server.

This differs from mobile_contract_check.py on purpose: that one uses
Django's in-process test client to assert response shapes. This one goes
over the network the way a phone does — real multipart uploads, real JWT
refresh, real unauthenticated public endpoint — so it also exercises
serialization, file handling and auth middleware end to end.

Usage:
    python scripts/e2e_mobile_test.py [base_url]
Default base_url: http://127.0.0.1:8000/api
"""

import io
import sys
import time

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/api').rstrip('/')
ROOT = BASE[: -len('/api')] if BASE.endswith('/api') else BASE

PATIENT_PHONE = '+919876500000'
DOCTOR_PHONE = '+919876500001'
ADMIN_PHONE = '+919876500099'

PASSED, FAILED = [], []
client = httpx.Client(timeout=30.0)


def check(name, ok, detail=''):
    (PASSED if ok else FAILED).append(name)
    print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f'\n        -> {detail}' if detail and not ok else ''))
    return ok


def section(title):
    print(f'\n{"=" * 62}\n{title}\n{"=" * 62}')


def rows(payload):
    if isinstance(payload, list):
        return payload
    return (payload or {}).get('results', [])


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def login(phone):
    """The exact two-step the app's login screen performs."""
    r = client.post(f'{BASE}/auth/send-otp/', json={'phone_number': phone})
    if r.status_code == 429:
        # Not a failure of the app. accounts/services.py allows
        # OTP_RATE_LIMIT_PER_HOUR (5) requests per number per hour, and each
        # full run of this script spends one for every role it logs in as.
        return None, (
            'rate-limited by the backend, not a broken endpoint — this script has been run '
            'more than 5 times for this number within the hour. Clear it with:\n'
            '           python manage.py shell -c '
            '"from accounts.models import OTPRequest; OTPRequest.objects.all().delete()"'
        )
    if r.status_code != 200:
        return None, f'send-otp {r.status_code} {r.text[:120]}'
    otp = r.json().get('debug_otp')
    if not otp:
        return None, 'no debug_otp in response (is DJANGO_DEBUG=True?)'
    r = client.post(f'{BASE}/auth/verify-otp/', json={'phone_number': phone, 'otp': otp})
    if r.status_code != 200:
        return None, f'verify-otp {r.status_code} {r.text[:120]}'
    return r.json(), None


# A genuinely parseable one-page PDF, built by hand so the test does not
# depend on any fixture file being present.
def tiny_pdf(text='HealthNow end-to-end test document'):
    content = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
        b'/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    out = io.BytesIO()
    out.write(b'%PDF-1.4\n')
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(f'{i} 0 obj\n'.encode() + body + b'\nendobj\n')
    xref = out.tell()
    out.write(f'xref\n0 {len(objs) + 1}\n'.encode())
    out.write(b'0000000000 65535 f \n')
    for off in offsets:
        out.write(f'{off:010d} 00000 n \n'.encode())
    out.write(f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    return out.getvalue()


# ===================================================================
section('0. SERVER REACHABLE')
try:
    r = client.get(f'{BASE}/doctors/', timeout=5.0)
    check('server responds (401 expected without a token)', r.status_code == 401, f'got {r.status_code}')
except Exception as e:
    check('server responds', False, f'{type(e).__name__}: {e}')
    print('\nServer unreachable — start it first. Aborting.')
    sys.exit(1)


# ===================================================================
section('1. PATIENT — login and session')

session, err = login(PATIENT_PHONE)
if not check('OTP login returns tokens', session is not None, err or ''):
    sys.exit(1)

p_access = session['access']
p_refresh = session['refresh']
check('login payload carries account.role (mobile routes the portal on it)',
      session.get('account', {}).get('role') == 'patient',
      f"got {session.get('account', {}).get('role')}")

r = client.get(f'{BASE}/auth/me/', headers=auth(p_access))
check('GET /auth/me/ with the access token', r.status_code == 200, f'{r.status_code} {r.text[:120]}')

# The app refreshes rather than forcing a re-login when a token expires.
r = client.post(f'{BASE}/auth/refresh/', json={'refresh': p_refresh})
refreshed = r.status_code == 200 and 'access' in r.json()
check('POST /auth/refresh/ issues a new access token', refreshed, f'{r.status_code} {r.text[:120]}')
if refreshed:
    p_access = r.json()['access']
    r = client.get(f'{BASE}/auth/me/', headers=auth(p_access))
    check('refreshed token is accepted', r.status_code == 200, f'{r.status_code}')

r = client.get(f'{BASE}/auth/me/', headers=auth('not-a-real-token'))
check('a bogus token is rejected with 401', r.status_code == 401, f'got {r.status_code}')


# ===================================================================
section('2. PATIENT — profiles')

r = client.get(f'{BASE}/profiles/', headers=auth(p_access))
profiles = rows(r.json())
check('GET /profiles/ returns the family list', r.status_code == 200 and len(profiles) > 0)
profile = profiles[0]
pid = profile['id']
check('profile carries initials for the header switcher', bool(profile.get('initials')),
      f'got {profile.get("initials")!r}')

r = client.post(f'{BASE}/profiles/', headers=auth(p_access),
                json={'full_name': 'E2E Test Dependent', 'relation': 'son'})
created_profile = r.json() if r.status_code == 201 else None
check('POST /profiles/ adds a family member (Settings screen)', r.status_code == 201,
      f'{r.status_code} {r.text[:150]}')


# ===================================================================
section('3. PATIENT — document locker (real multipart upload)')

files = {'file': ('e2e-report.pdf', tiny_pdf(), 'application/pdf')}
data = {'profile': pid, 'category': 'report', 'title': 'E2E Test Report'}
r = client.post(f'{BASE}/documents/', headers=auth(p_access), files=files, data=data)
doc_ok = r.status_code == 201
check('POST /documents/ multipart upload succeeds', doc_ok, f'{r.status_code} {r.text[:200]}')
doc_id = r.json()['id'] if doc_ok else None

if doc_id:
    r = client.get(f'{BASE}/documents/', headers=auth(p_access), params={'profile_id': pid})
    check('uploaded document appears in the locker list',
          any(d['id'] == doc_id for d in rows(r.json())))

    r = client.get(f'{BASE}/documents/{doc_id}/', headers=auth(p_access))
    detail = r.json() if r.status_code == 200 else {}
    check('GET /documents/<id>/ returns the detail screen payload', r.status_code == 200)
    check('document detail exposes a file URL the app can open', bool(detail.get('file')),
          f'file={detail.get("file")!r}')

    file_url = detail.get('file') or ''
    if file_url:
        full = file_url if file_url.startswith('http') else ROOT + file_url
        r = client.get(full)
        check('the stored file is actually downloadable over HTTP', r.status_code == 200,
              f'{r.status_code} at {full}')

    r = client.get(f'{BASE}/documents/', headers=auth(p_access),
                   params={'profile_id': pid, 'category': 'prescription'})
    check('category filter excludes the report', all(d['category'] == 'prescription' for d in rows(r.json())))


# ===================================================================
section('4. PATIENT — medicines and dose logging')

r = client.post(f'{BASE}/medications/', headers=auth(p_access),
                json={'profile': pid, 'name': 'E2E Paracetamol 650mg', 'dosage': '1 tablet',
                      'instructions': 'After food', 'frequency': 'daily'})
med_ok = r.status_code == 201
check('POST /medications/ adds a medicine', med_ok, f'{r.status_code} {r.text[:150]}')
med_id = r.json()['id'] if med_ok else None

if med_id:
    r = client.post(f'{BASE}/reminders/', headers=auth(p_access),
                    json={'medication': med_id, 'time_of_day': '08:00'})
    rem_ok = r.status_code == 201
    check('POST /reminders/ attaches a reminder time', rem_ok, f'{r.status_code} {r.text[:150]}')
    rem_id = r.json()['id'] if rem_ok else None

    r = client.get(f'{BASE}/medications/', headers=auth(p_access), params={'profile_id': pid})
    mine = [m for m in rows(r.json()) if m['id'] == med_id]
    check('medication comes back with its nested reminders',
          bool(mine) and len(mine[0].get('reminders', [])) == 1)

    if rem_id:
        stamp = time.strftime('%Y-%m-%dT%H:%M:%SZ')
        r = client.post(f'{BASE}/dose-logs/', headers=auth(p_access),
                        json={'reminder': rem_id, 'status': 'taken', 'scheduled_for': stamp})
        check('POST /dose-logs/ records a taken dose', r.status_code == 201,
              f'{r.status_code} {r.text[:150]}')

        r = client.get(f'{BASE}/dose-logs/', headers=auth(p_access), params={'profile_id': pid})
        check('dose log is returned for the "taken today" check',
              any(l['reminder'] == rem_id for l in rows(r.json())))


# ===================================================================
section('5. PATIENT — insurance (upload, chat, estimate)')

files = {'file': ('e2e-policy.pdf', tiny_pdf('Policy: sum insured Rs 500000, co-payment 10 percent'),
                  'application/pdf')}
r = client.post(f'{BASE}/insurance/', headers=auth(p_access), files=files, data={'profile': pid})
pol_ok = r.status_code == 201
check('POST /insurance/ uploads and processes a policy', pol_ok, f'{r.status_code} {r.text[:200]}')
policy_id = r.json()['id'] if pol_ok else None

r = client.get(f'{BASE}/insurance/', headers=auth(p_access), params={'profile_id': pid})
policies = rows(r.json())
check('GET /insurance/ lists policies', r.status_code == 200 and len(policies) > 0)

if policies:
    existing = policies[0]['id']
    r = client.get(f'{BASE}/insurance/{existing}/chat/', headers=auth(p_access))
    check('GET /insurance/<id>/chat/ returns history (the 405 bug stays fixed)',
          r.status_code == 200, f'{r.status_code}')

    r = client.post(f'{BASE}/insurance/{existing}/estimate/', headers=auth(p_access),
                    json={'claim_category': 'Knee surgery', 'estimated_bill': '150000'})
    est_ok = r.status_code == 201
    check('POST /insurance/<id>/estimate/ returns a claim estimate', est_ok,
          f'{r.status_code} {r.text[:200]}')
    if est_ok:
        e = r.json()
        check('estimate includes the numbers the screen renders',
              all(k in e for k in ('eligible', 'estimated_insurer_share',
                                   'estimated_out_of_pocket', 'reasoning_summary')))

    r = client.post(f'{BASE}/insurance/{existing}/confirm/', headers=auth(p_access))
    check('POST /insurance/<id>/confirm/ marks it validated',
          r.status_code == 200 and r.json().get('status') == 'validated', f'{r.status_code}')


# ===================================================================
section('6. PATIENT — emergency card and the PUBLIC endpoint')

r = client.get(f'{BASE}/emergency-qr/', headers=auth(p_access))
cards = [c for c in rows(r.json()) if c['profile'] == pid]
if not cards:
    r = client.post(f'{BASE}/emergency-qr/', headers=auth(p_access),
                    json={'profile': pid, 'emergency_contact_name': 'E2E Contact',
                          'emergency_contact_phone': '+919812345678'})
    check('POST /emergency-qr/ creates the card', r.status_code == 201, f'{r.status_code} {r.text[:150]}')
    cards = [r.json()] if r.status_code == 201 else []

if cards:
    card = cards[0]
    token = card['public_token']

    r = client.patch(f'{BASE}/emergency-qr/{card["id"]}/', headers=auth(p_access),
                     json={'include_medications': True, 'include_allergies': True})
    check('PATCH /emergency-qr/<id>/ saves a visibility toggle', r.status_code == 200,
          f'{r.status_code} {r.text[:150]}')

    # No Authorization header at all — this is what a paramedic's scan does.
    r = client.get(f'{ROOT}/api/public/emergency/{token}/', params={'format': 'json'})
    pub_ok = r.status_code == 200
    check('public QR URL is readable with NO authentication', pub_ok, f'{r.status_code}')
    if pub_ok:
        keys = set(r.json())
        allowed = {'name', 'blood_group', 'allergies', 'medications',
                   'emergency_contact_name', 'emergency_contact_phone'}
        check('public card leaks nothing beyond the allow-list', keys <= allowed,
              f'unexpected keys: {keys - allowed}')

    r = client.get(f'{ROOT}/api/public/emergency/{token}/')
    check('public QR URL also renders an HTML card for a human scanner',
          r.status_code == 200 and 'text/html' in r.headers.get('content-type', ''),
          f'{r.status_code} {r.headers.get("content-type")}')

    r = client.post(f'{BASE}/emergency-qr/{card["id"]}/regenerate/', headers=auth(p_access))
    new_ok = r.status_code == 200
    check('POST regenerate/ issues a new token', new_ok, f'{r.status_code}')
    if new_ok:
        check('the OLD token stops working immediately',
              client.get(f'{ROOT}/api/public/emergency/{token}/', params={'format': 'json'}).status_code == 404)
        token = r.json()['public_token']

    r = client.post(f'{BASE}/emergency-qr/{card["id"]}/revoke/', headers=auth(p_access))
    check('POST revoke/ disables the card', r.status_code == 200)
    check('a revoked card shows nothing to a scanner',
          client.get(f'{ROOT}/api/public/emergency/{token}/', params={'format': 'json'}).status_code == 404)
    # Leave the account usable afterwards.
    client.post(f'{BASE}/emergency-qr/{card["id"]}/regenerate/', headers=auth(p_access))


# ===================================================================
section('7. PATIENT — AI assistant, timeline, notifications, find care')

r = client.post(f'{BASE}/profiles/{pid}/ask/', headers=auth(p_access),
                json={'question': 'What medicines am I taking?'})
check('POST /profiles/<id>/ask/ answers (mock or real)', r.status_code == 200 and 'answer' in r.json(),
      f'{r.status_code} {r.text[:200]}')

r = client.get(f'{BASE}/timeline/', headers=auth(p_access), params={'profile_id': pid})
check('GET /timeline/ responds', r.status_code == 200)

r = client.get(f'{BASE}/notifications/', headers=auth(p_access), params={'profile_id': pid})
check('GET /notifications/ responds', r.status_code == 200)

r = client.get(f'{BASE}/allergies/', headers=auth(p_access), params={'profile_id': pid})
check('GET /allergies/ responds', r.status_code == 200)

r = client.get(f'{BASE}/doctors/', headers=auth(p_access))
check('GET /doctors/ powers Find Care', r.status_code == 200)


# ===================================================================
section('8. SECURITY — cross-tenant writes, over real HTTP')

# A second account standing in for an attacker who knows a reference ID.
attacker, err = login('+919000000123')
if check('a second account can log in', attacker is not None, err or ''):
    a_access = attacker['access']
    victim = pid  # the demo patient's reference ID

    for label, path, payload in [
        ('medication', '/medications/', {'profile': victim, 'name': 'INJECTED'}),
        ('allergy', '/allergies/', {'profile': victim, 'kind': 'drug', 'substance': 'INJECTED'}),
        ('emergency card', '/emergency-qr/', {'profile': victim, 'emergency_contact_name': 'ATTACKER',
                                              'emergency_contact_phone': '+910000000000'}),
    ]:
        r = client.post(f'{BASE}{path}', headers=auth(a_access), json=payload)
        check(f'attacker CANNOT write a {label} onto another patient (403)',
              r.status_code == 403, f'got {r.status_code} {r.text[:120]}')

    r = client.post(f'{BASE}/documents/', headers=auth(a_access),
                    files={'file': ('evil.pdf', tiny_pdf(), 'application/pdf')},
                    data={'profile': victim, 'category': 'report', 'title': 'INJECTED'})
    check('attacker CANNOT upload a document onto another patient (403)',
          r.status_code == 403, f'got {r.status_code}')

    r = client.get(f'{BASE}/documents/', headers=auth(a_access), params={'profile_id': victim})
    check('attacker CANNOT read another patient documents', len(rows(r.json())) == 0)

    r = client.get(f'{BASE}/profiles/', headers=auth(a_access))
    check('attacker only sees their own profiles',
          all(p['id'] != victim for p in rows(r.json())))


# ===================================================================
section('9. DOCTOR — consent flow end to end')

doc_session, err = login(DOCTOR_PHONE)
if check('doctor logs in', doc_session is not None, err or ''):
    d_access = doc_session['access']
    check('doctor login reports role=doctor', doc_session['account']['role'] == 'doctor',
          f"got {doc_session['account']['role']}")

    r = client.get(f'{BASE}/doctors/me/', headers=auth(d_access))
    me_ok = r.status_code == 200
    check('GET /doctors/me/ returns the doctor record', me_ok, f'{r.status_code} {r.text[:150]}')
    doctor_rec = r.json() if me_ok else {}

    r = client.patch(f'{BASE}/doctors/availability/', headers=auth(d_access),
                     json={'available_days': ['Monday', 'Wednesday', 'Friday'],
                           'clinic_open_time': '09:30', 'clinic_close_time': '17:30'})
    check('PATCH /doctors/availability/ saves clinic hours', r.status_code == 200,
          f'{r.status_code} {r.text[:150]}')

    r = client.patch(f'{BASE}/doctors/availability/', headers=auth(d_access),
                     json={'clinic_open_time': '18:00', 'clinic_close_time': '09:00'})
    check('closing before opening is rejected', r.status_code == 400, f'got {r.status_code}')

    # Use the newly created dependent profile so the consent flow runs from
    # scratch rather than reusing an existing grant.
    target = created_profile['id'] if created_profile else pid
    r = client.post(f'{BASE}/doctor-access/', headers=auth(d_access),
                    json={'doctor': doctor_rec.get('id'), 'profile': target})
    grant_ok = r.status_code == 201
    check('doctor requests access to a patient', grant_ok, f'{r.status_code} {r.text[:200]}')
    grant_id = r.json()['id'] if grant_ok else None

    if grant_id:
        r = client.get(f'{BASE}/documents/', headers=auth(d_access), params={'profile_id': target})
        check('BEFORE approval the doctor sees nothing', len(rows(r.json())) == 0)

        r = client.post(f'{BASE}/doctor-access/{grant_id}/approve/', headers=auth(d_access))
        check('doctor CANNOT approve their own request (403)', r.status_code == 403,
              f'got {r.status_code}')

        r = client.get(f'{BASE}/doctor-access/', headers=auth(p_access), params={'profile_id': target})
        pending = [g for g in rows(r.json()) if g['id'] == grant_id]
        check('patient sees the pending request', bool(pending))
        check('request names the doctor so the patient can decide',
              bool(pending and pending[0].get('doctor_detail', {}).get('full_name')))

        r = client.post(f'{BASE}/doctor-access/{grant_id}/approve/', headers=auth(p_access))
        check('patient approves the request', r.status_code == 200, f'{r.status_code} {r.text[:150]}')

        r = client.get(f'{BASE}/profiles/', headers=auth(d_access))
        check('AFTER approval the doctor can see the patient name',
              any(p['id'] == target for p in rows(r.json())))

        r = client.post(f'{BASE}/consultation-notes/', headers=auth(d_access),
                        json={'profile': target, 'diagnosis': 'E2E check',
                              'prescription': 'none', 'notes': 'end-to-end test'})
        check('doctor writes a consultation note', r.status_code == 201,
              f'{r.status_code} {r.text[:150]}')

        r = client.post(f'{BASE}/medications/', headers=auth(d_access),
                        json={'profile': target, 'name': 'DOCTOR SHOULD NOT ADD'})
        check('doctor still CANNOT write into the patient record (403)', r.status_code == 403,
              f'got {r.status_code}')

        r = client.post(f'{BASE}/doctor-access/{grant_id}/revoke/', headers=auth(p_access))
        check('patient revokes access', r.status_code == 200)

        r = client.get(f'{BASE}/documents/', headers=auth(d_access), params={'profile_id': target})
        check('AFTER revocation the doctor sees nothing again', len(rows(r.json())) == 0)


# ===================================================================
section('10. ADMIN — queues and verification')

admin_session, err = login(ADMIN_PHONE)
if check('admin logs in', admin_session is not None, err or ''):
    a_access = admin_session['access']
    check('admin login reports a staff role',
          admin_session['account']['role'] in ('admin', 'ocr_reviewer', 'claims_ops'),
          f"got {admin_session['account']['role']}")

    r = client.get(f'{BASE}/admin/dashboard/summary/', headers=auth(a_access))
    check('GET /admin/dashboard/summary/ returns the counters', r.status_code == 200,
          f'{r.status_code} {r.text[:150]}')

    for label, path in [('documents', '/admin/documents/'),
                        ('insurance policies', '/admin/insurance-policies/'),
                        ('doctor verification', '/admin/doctor-verification/'),
                        ('patients', '/admin/patients/'),
                        ('accounts', '/admin/accounts/'),
                        ('audit log', '/admin/audit-log/')]:
        r = client.get(f'{BASE}{path}', headers=auth(a_access))
        check(f'admin {label} queue responds', r.status_code == 200, f'{r.status_code}')

    r = client.get(f'{BASE}/admin/doctor-verification/', headers=auth(a_access))
    doctors_q = rows(r.json())
    if doctors_q:
        target_doc = doctors_q[0]
        r = client.post(f'{BASE}/admin/doctor-verification/{target_doc["id"]}/approve/',
                        headers=auth(a_access))
        check('admin approves a doctor', r.status_code == 200, f'{r.status_code}')

        r = client.get(f'{BASE}/admin/audit-log/', headers=auth(a_access))
        check('the approval is written to the audit log',
              any(e['action'] == 'approve_doctor' for e in rows(r.json())))

    # A patient must never reach staff endpoints.
    r = client.get(f'{BASE}/admin/accounts/', headers=auth(p_access))
    check('a patient token is refused by an admin endpoint (403)', r.status_code == 403,
          f'got {r.status_code}')


# ===================================================================
section('CLEANUP')
# The dependent profile created in section 2 is scaffolding, not a result.
# Left behind, repeated runs pile up dependents on the demo account — and
# Profile.Meta orders by '-relation', so one of them displaces the real
# profile at index 0 for anything that reads profiles[0].
if created_profile:
    r = client.delete(f'{BASE}/profiles/{created_profile["id"]}/', headers=auth(p_access))
    check('the test dependent profile is removed', r.status_code in (204, 404),
          f'got {r.status_code}')


section('RESULT')
print(f'{len(PASSED)} passed, {len(FAILED)} failed')
if FAILED:
    print('\nFailures:')
    for f in FAILED:
        print('  -', f)
    sys.exit(1)
print('\nEvery mobile flow works end to end.')
