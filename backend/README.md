# CuraPath Backend (Django + DRF)

The backend for the AI Healthcare Platform's User Portal (and the shared
foundation for the Admin/Doctor portals to come). Matches the architecture
in the TDD: Django + DRF, PostgreSQL (Neon-ready), Claude API for AI
structuring/chat, JWT auth over phone OTP.

## What's implemented

| App | Covers |
|---|---|
| `accounts` | Phone + OTP auth, JWT issuance, role field (patient/doctor/admin/ocr_reviewer/claims_ops) |
| `family` | Family member profiles, allergy records |
| `documents` | Medical Locker uploads, OCR/Claude structuring hook, Medical Timeline read model |
| `insurance` | Policy upload/structuring, exclusions/waiting periods/sub-limits, **deterministic claim estimator**, insurance chat |
| `medicines` | Medications, reminder schedules, dose logs |
| `emergency` | Emergency QR generation/revocation, unauthenticated public scan endpoint |
| `doctors` | Doctor registration/verification, consent-based `DoctorPatientAccess`, consultation notes |
| `admin_portal` | Staff roles/permissions, audit log, review endpoints for documents/policies/doctors/accounts |
| `ai` | Centralized `ClaudeService` — every Claude call in the app goes through here |

Everything above has been run and tested against real HTTP requests during
development (not just written and assumed correct) — auth flow, family
profiles, and the insurance claim estimator's three branches (eligible /
excluded / waiting-period) were specifically verified, including catching
and fixing two real bugs in the estimator logic along the way.

## What's intentionally mocked (needs your credentials to go live)

Nothing is fake or stubbed-out silently — every mock is clearly marked in
the response itself and in code comments, and swapping to the real thing
requires **zero other code changes**, just setting the right `.env` value:

- **`ANTHROPIC_API_KEY`** — until set, `ai/claude_service.py` returns
  clearly-labeled mock responses (`"_mock": True` in JSON, or a plain-English
  note in chat answers) instead of calling Claude. All prompts are already
  written and versioned in `ai/prompts/`.
- **OCR provider** (Google Vision / AWS Textract) — same pattern, via
  `OCR_PROVIDER_API_KEY`.
- **SMS gateway** (MSG91/Twilio) for real OTP delivery — until set, OTPs are
  logged server-side and returned in the API response when `DEBUG=True`.
- **`DATABASE_URL`** — defaults to local SQLite. Paste in the Neon
  PostgreSQL connection string when you have it; no code changes needed.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env       # then edit .env if you have real keys already

python manage.py migrate
python manage.py seed_demo   # populates demo data matching the frontend's mock data
python manage.py runserver
```

API is now live at `http://localhost:8000/api/`. Django admin at
`http://localhost:8000/admin/`.

### Demo logins (from `seed_demo`)
- **Patient:** phone `+919876500000` — call `/api/auth/send-otp/`, then check
  the server log (or the `debug_otp` field in the response, since `DEBUG=True`)
  for the OTP, then `/api/auth/verify-otp/`.
- **Admin (Django admin panel):** phone `+919876500099` at `/admin/`. The
  password is generated when `seed_demo` first creates the account and printed
  once in its output — there is no fixed default.

### Connecting the Neon database later
Add to `.env`:
```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```
Then:
```bash
python manage.py migrate
# Don't run seed_demo against a production database: it creates demo
# accounts there, including a superuser.
```

### Connecting the React User Portal frontend
The frontend (separate zip) currently reads from `src/data/mockData.ts`.
To wire it to this real backend:
1. Set `CORS_ALLOWED_ORIGINS` in `.env` to match wherever the frontend runs
   (`http://localhost:5173` is already the default for `npm run dev`).
2. Replace the imports from `mockData.ts` with TanStack Query hooks calling
   these endpoints (auth token stored after `/api/auth/verify-otp/`, sent as
   `Authorization: Bearer <token>` on every subsequent call).

## Full API reference

### Auth (`/api/auth/`)
```
POST /api/auth/send-otp/          { phone_number }
POST /api/auth/verify-otp/        { phone_number, otp } → { access, refresh, account }
POST /api/auth/refresh/           { refresh } → { access }
GET  /api/auth/me/                → current account
PATCH /api/auth/me/
POST /api/auth/staff-login/       { email, password } → { access, refresh, account }   (Admin Portal only)
```

#### Admin Portal sign-in (curapath.in/admin)

The web Admin Portal at `/admin` has its own email + password sign-in. It
signs in to an existing staff account — the one on `ADMIN_PHONE_NUMBERS` —
so OTP sign-in at `/login` keeps working for the same account, and the
usual staff check still runs on every request.

Set or change it on the server (the password is asked for at a hidden
prompt, or read from `STAFF_LOGIN_PASSWORD`; never pass it on the command line):

```bash
python manage.py set_staff_login admin@curapath.com           # create or change the password
python manage.py set_staff_login admin@curapath.com --phone +91XXXXXXXXXX   # if several admin numbers
python manage.py set_staff_login admin@curapath.com --remove  # turn it off
```

Passwords are checked with Django's password rules, including similarity
to the email; `--allow-weak` overrides that. Five wrong passwords lock the
sign-in for 15 minutes (counted in the database), requests are also
throttled per client (`THROTTLE_STAFF_LOGIN`, default `20/hour`), and every
successful sign-in is written to the audit log. The password is stored
separately from `Account.password`, so it cannot be used at Django's own
`/admin/` login, which has no rate limit.

### Family (`/api/`)
```
GET/POST        /api/profiles/
GET/PUT/PATCH/DELETE /api/profiles/{id}/
GET/POST        /api/allergies/?profile_id=
```

### Documents & Timeline (`/api/`)
```
GET/POST  /api/documents/?profile_id=&category=
GET       /api/documents/{id}/
PATCH     /api/documents/{id}/correct/     { structured_data }
GET       /api/timeline/?profile_id=
```

### Insurance (`/api/`)
```
GET/POST  /api/insurance/?profile_id=
GET       /api/insurance/{id}/
POST      /api/insurance/{id}/chat/        { question }
GET       /api/insurance/{id}/chat/        → chat history
POST      /api/insurance/{id}/estimate/    { claim_category, estimated_bill }
GET       /api/claims/
```

### Medicines (`/api/`)
```
GET/POST  /api/medications/?profile_id=
GET/POST  /api/reminders/
GET/POST  /api/dose-logs/
```

### Emergency (`/api/`)
```
GET/POST  /api/emergency-qr/
POST      /api/emergency-qr/{id}/regenerate/
POST      /api/emergency-qr/{id}/revoke/
GET       /api/public/emergency/{token}/    ← unauthenticated, allow-listed fields only
```

### Doctors (`/api/`)
```
GET/POST  /api/doctors/
GET/PATCH /api/doctors/me/
POST      /api/doctors/verify-registration/   # NMC pre-check, 10/min
GET/POST  /api/doctor-access/
POST      /api/doctor-access/{id}/approve/
POST      /api/doctor-access/{id}/deny/
POST      /api/doctor-access/{id}/revoke/
GET/POST  /api/consultation-notes/
```

### Admin Portal (`/api/admin/`) — staff roles only
```
GET  /api/admin/dashboard/summary/
GET/PATCH  /api/admin/documents/?status=needs_review
GET/PATCH  /api/admin/insurance-policies/?status=needs_review
GET        /api/admin/doctors/?status=review|pending,manual_review,...
GET        /api/admin/doctors/verification-queue/
POST       /api/admin/doctors/{id}/approve/
POST       /api/admin/doctors/{id}/reject/        {"reason": "..."}
POST       /api/admin/doctors/{id}/reverify/
           (/api/admin/doctor-verification/... is the same viewset, kept for older apps)
GET/PATCH  /api/admin/accounts/?search=
POST       /api/admin/accounts/{id}/deactivate/
GET        /api/admin/audit-log/
```

## Doctor NMC verification

When a doctor registers (or changes their name, registration number,
council, year or licence), the backend looks the registration up on the
**NMC Indian Medical Register** and stores what it found for the admin.
**The check never approves or rejects anyone** — every registration lands in
the admin queue, and only an admin decides.

**Providers** (`doctors/services/verification/`, all behind one
`VerificationResult` shape, tried in `DOCTOR_VERIFY_PROVIDERS` order):

| Provider | What it is | Runs | Off unless |
|---|---|---|---|
| `nmc` (`nmc_provider.py`) | NMC's public JSON search (`/indian-medical-register/search`, plus `/black-list-doctors/search` for removals). Free, ~2 s. | always — sign-up, the Verify button, admin Re-verify, the cron job | — |
| `apify` (`apify_provider.py`) | The community [NMC Doctor Lookup](https://apify.com/whoareyouanas/nmc-doctor-lookup) actor, run from Apify's servers (helps if NMC blocks Render's IP). 10–60 s, ~$5 per 1,000 lookups. **Built on NMC's retired `/MCIRest` endpoints (404 since the 2026 redesign) — check it with the smoke test before paying for it.** | cron job only | `APIFY_TOKEN` |
| `decentro` (`decentro_provider.py`) | Decentro's commercial NMC verification API (`POST /v2/kyc/professional-verification/nmc`). Needs the doctor's registration year. Staging by default. | cron job only | `DECENTRO_CLIENT_ID` + `DECENTRO_CLIENT_SECRET` |

- **The chain** stops at the first provider that finds the number (or
  several entries for it); "not found" and "unreachable" move on to the next.
  Every provider asked is logged on the doctor as `provider_attempts`
  (`[{"provider": "nmc", "result": "not_found", "ms": 2140}, …]`), which the
  admin queue shows. Even when every provider says "not found", the doctor
  goes to the admin — a typo'd number is not grounds for automatic rejection.
- **Consent:** the outside providers (Apify, Decentro) are only asked about
  doctors who ticked the consent box at sign-up (`verification_consent_at`).
  Doctors without it — everyone registered before the box, and older app
  versions — are only ever checked against NMC's own register.
- **Matching:** the register searches by substring, so rows are filtered to
  the exact number — tolerating council prefixes (Delhi stores `DMC/R/11030`,
  AP `APMC/FMR/…`, old Maharashtra `B-…`) and leading zeros. Up to
  `NMC_MAX_PAGES` pages of 100 are read before concluding "not found". When a
  number isn't in the chosen council, all councils are searched and any hit
  is shown to the doctor and admin ("listed under Tamil Nadu Medical Council
  (2015)") — usually the doctor picked the wrong council.
- **Personal data:** each provider keeps an allowlist of fields; `strip_pii`
  then drops address, DOB, parent's name, UPRN, phone, email and Aadhaar at
  any depth before anything is stored. Decentro calls log only
  `decentroTxnId`.

**Statuses** (`Doctor.verification_status`):

| Status | Meaning | Who sets it |
|---|---|---|
| `pending` | Just submitted, not yet checked | registration / credential edit |
| `manual_review` | Checked — result waiting for an admin ("Under review") | the check |
| `failed` | Register unreachable — retried by the cron job ("Under review") | the check |
| `verified` | Approved; visible in Find Care | **admin only** |
| `rejected` | Not approved; the doctor sees `rejection_reason` | **admin only** |

A verified doctor who later shows up as removed on the register goes back to
`manual_review`; nobody is un-verified automatically.

**Env vars** (all optional):

| Var | Default | |
|---|---|---|
| `NMC_BASE_URL` | `https://nmc.org.in/indian-medical-register` | |
| `NMC_TIMEOUT` | `20` | seconds per request |
| `NMC_CA_BUNDLE` | — | CA file, only if NMC's chain fails on the host. TLS is never disabled. |
| `NMC_MAX_PAGES` | `3` | pages of 100 rows read before "not found" |
| `DOCTOR_NAME_MATCH_THRESHOLD` | `0.85` | name-match score shown as "matches" |
| `DOCTOR_VERIFY_PROVIDERS` | `nmc,apify,decentro` | order; unconfigured ones are skipped |
| `APIFY_TOKEN` | — | turns on the Apify fallback |
| `APIFY_TIMEOUT` | `90` | seconds |
| `DECENTRO_BASE_URL` | `https://in.staging.decentro.tech` | `https://in.decentro.tech` once production access is granted |
| `DECENTRO_CLIENT_ID` / `DECENTRO_CLIENT_SECRET` | — | turn on the Decentro fallback (staging and production credentials differ) |
| `DECENTRO_TIMEOUT` | `30` | seconds |
| `THROTTLE_NMC_PRECHECK` | `10/min` | the form's Verify button |

**Commands**
```bash
python manage.py nmc_smoke_test 2001123450 MAH        # live lookup: raw answer, unfiltered rows, parsed result
python manage.py nmc_smoke_test 5892 MAD --try-councils MAD,MCI --year 2003
python manage.py nmc_smoke_test 5892 MAD --year 2003 --provider decentro   # one real, billed call
python manage.py reverify_doctors                     # full chain over doctors waiting on a check
python manage.py reverify_doctors --audit-verified    # removal check for verified doctors
```

`reverify_doctors` picks up pending and register-unreachable doctors, plus
doctors under review whose number NMC couldn't find — once per configured
fallback they haven't been through (so adding Decentro credentials later
re-checks them once, not every run). At most `--limit` (50) per run.

**Render cron job** (recommended): a Cron Job service on the backend's
repo/env, schedule `0 */6 * * *`, command
`python manage.py reverify_doctors --pause 2 && python manage.py reverify_doctors --audit-verified`.

**Limitations**
- The NMC register is a public website with no SLA; slow or down periods
  show up as `failed` and are retried. Admins can always decide by hand
  (the queue links to the register).
- Older app versions don't send a council, so their registrations are
  "Not checked" until the doctor adds one.
- Tests mock every HTTP call (`doctors/test_doctor_verification.py`); only
  `nmc_smoke_test` talks to the real register.

## Project layout
```
backend/
  config/            settings, root urls
  accounts/          Account model (custom user), OTP auth
  family/            Profile (family members), allergies
  documents/         Medical Locker, Timeline
  insurance/         Policy, claim estimator (deterministic logic), chat
  medicines/         Medications, reminders, dose logs
  emergency/         Emergency QR
  doctors/           Doctor verification, consent-based patient access
  admin_portal/      Staff roles, audit log, review endpoints
  ai/                ClaudeService — the ONLY place Claude API calls happen
    prompts/         Versioned prompt files
```

## Next steps (not yet built)
- Celery + Redis for async OCR/Claude processing (currently synchronous —
  fine for demo/dev, will need to move before real document upload volume)
- Cloudinary/S3 file storage (currently local `media/` — fine for dev, not
  for production)
- Real SMS gateway, OCR provider, and Claude API key wiring
- Frontend integration (replacing `mockData.ts` with real API calls)
- Admin Portal and Doctor Portal frontends (backend endpoints for both
  already exist above)
