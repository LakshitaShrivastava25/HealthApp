# HealthNow Backend (Django + DRF)

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
- **Admin (Django admin panel):** phone `+919876500099`, password `ChangeMe123!`
  at `/admin/`.

### Connecting the Neon database later
Add to `.env`:
```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```
Then:
```bash
python manage.py migrate
python manage.py seed_demo   # optional, if you want demo data on the real DB too
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
```

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
GET/PATCH  /api/admin/doctor-verification/
POST       /api/admin/doctor-verification/{id}/approve/
POST       /api/admin/doctor-verification/{id}/reject/
GET/PATCH  /api/admin/accounts/?search=
POST       /api/admin/accounts/{id}/deactivate/
GET        /api/admin/audit-log/
```

## Project layout
```
healthnow_backend/
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
