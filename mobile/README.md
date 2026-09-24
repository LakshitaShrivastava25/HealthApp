# CurePath Mobile

An Expo (React Native) client for the **same** Django backend the web app uses.
No API logic is duplicated server-side — every screen here talks to
`backend/` over the existing REST endpoints.

## What's in it

One app, one login. The account's `role` from `/api/auth/verify-otp/` decides
which portal you land in:

| Role | Lands in | Screens |
| --- | --- | --- |
| `patient` | Patient tabs | Home, Timeline, Locker, Medicines, More → Insurance, Find Care, Emergency Card, Doctor Access, Settings, Help, Document detail |
| `doctor` (verified) | Doctor tabs | My Patients, Request Access, Profile, Patient record |
| `doctor` (unverified) | Setup stack | Registration, Verification status |
| `admin` / `ocr_reviewer` / `claims_ops` | Admin tabs | Overview, Documents, Policies, Doctors, More → Patients, Accounts, Audit log |

The web build keeps three separate token stores because its portals are three
routes on one origin that one browser might hold open at once. A phone is one
person holding one session, so there is a single session here, stored in the
OS keychain via `expo-secure-store` rather than in `localStorage`.

## Running it

**1. Start the backend, bound so the phone can reach it.**

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo        # optional demo data
.venv/Scripts/python manage.py runserver 0.0.0.0:8000
```

`0.0.0.0` matters. Bound to `127.0.0.1` the server is unreachable from a
phone, which is the most common cause of "the app won't load".

`DJANGO_ALLOWED_HOSTS` already defaults to `*`. CORS does not apply to a
native app, so no `CORS_ALLOWED_ORIGINS` change is needed.

**2. Start the app.**

```bash
cd mobile
npm install
npm start
```

Scan the QR with Expo Go. The phone and the computer must be on the same
Wi-Fi network.

## How the app finds the backend

`src/lib/config.ts` resolves the base URL per request, in this order:

1. `EXPO_PUBLIC_API_URL`, if set — for a real deployment or a tunnel.
2. The address saved in the login screen's **Can't connect?** panel.
3. The Expo dev-server host with Django's port — this is how it works on a
   physical phone. Expo already knows your machine's LAN address, so the
   host is read back out of the manifest instead of hard-coded.
4. `10.0.2.2:8000` on an Android emulator, else `localhost:8000`.

If the phone can't reach the server, open **Can't connect?** on the login
screen and type the address directly. Help → Diagnostics shows which server
the app is currently talking to.

## Demo logins

`seed_demo` creates them. OTPs are not sent by SMS — no provider is wired up
— so while `DJANGO_DEBUG=True` the code comes back in the response and the
login screen displays it.

- Patient: `+919876500000`
- Admin: `+919876500099`

## Verifying a change

```bash
cd mobile
npx tsc --noEmit                                 # types
npx expo-doctor                                  # dependency/config health
npx expo export --platform android               # proves the whole app bundles

cd ../backend
.venv/Scripts/python manage.py test              # cross-tenant write protection
.venv/Scripts/python scripts/mobile_contract_check.py
.venv/Scripts/python scripts/e2e_mobile_test.py  # needs the server running
```

Run `npx tsc --noEmit` **after** Metro has started at least once. `app.json`
enables `experiments.typedRoutes`, and the route union it checks against is
generated into `.expo/types/` on the first Metro run — before that exists,
every `router.push()` path typechecks vacuously.

The two Python scripts overlap deliberately:

- `mobile_contract_check.py` uses Django's in-process test client to assert
  response *shapes* — that each field a screen reads is present.
- `e2e_mobile_test.py` drives a **running server over HTTP**, the way a phone
  does: real multipart uploads, real JWT refresh, the unauthenticated public
  QR endpoint, the full doctor consent cycle (request → patient approves →
  doctor reads → patient revokes), and the cross-tenant attacks. It catches
  anything that only breaks over the network.

## How AI failures behave

`ANTHROPIC_API_KEY` has three states, and all of them are survivable:

| Key | What happens |
| --- | --- |
| unset | Uploads succeed with clearly-marked mock structuring |
| valid | Real extraction |
| present but broken (revoked, mistyped, rate-limited, service down) | Uploads still succeed; the record is saved as **needs review** with the reason attached |

`ClaudeService.enabled` only checks that the key is non-empty — it cannot
tell whether the key works. Every API failure is caught in `_call` and
raised as `ClaudeUnavailable`, which callers turn into a saved record rather
than a 500. Text extraction (pypdf) runs regardless of the key, so a
digital PDF is always read even with no AI at all.

Image OCR remains genuinely unimplemented: `OCR_PROVIDER_API_KEY` has no
provider wired behind it, so a photographed document is saved and reported
honestly rather than silently producing nothing.

## What an upload creates

Uploading a document writes the record *and* what it implies:

- a **timeline event for the document itself** — always, even with no key
  and no readable text, because the document is a real dated health event
- a timeline event per **diagnosis** and per **test** found
- a **Medication** row per medicine found on a prescription

Rebuilding is idempotent. Timeline events are deleted and recreated;
medications are only ever added, never deleted — a `Medication` owns its
`ReminderSchedule` rows through a cascading FK, so rebuilding by deletion
would wipe reminder times the person set by hand.

## Known remaining limitation

- **Doctor registration self-elevates.** Registering sets `role=doctor`
  immediately. It grants nothing on its own — requesting patient access
  still requires `verification_status == verified`, and the directory no
  longer lists or exposes unverified registrations — but the role flips
  before any human has checked the credential.
