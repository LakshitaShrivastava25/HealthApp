# HealthNow — AI Healthcare Platform

One repo, two projects: the User Portal (React frontend) and its Django
backend, meant to be run side by side during development.

```
healthnow-platform/
 ├── frontend/     React + TypeScript + Vite + Tailwind — the User Portal UI
 └── backend/      Django + DRF — auth, records, insurance, AI service layer
```

Each has its own README with full setup details (`frontend/README.md` is
the default Vite one; see the root of `backend/README.md` for the real one).
Quick start for both:

## 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_demo      # demo data matching the frontend's mock data
python manage.py runserver      # → http://localhost:8000
```

## 2. Frontend

```bash
cd frontend
npm install
npm run dev                     # → http://localhost:5173
```

The frontend currently reads from `frontend/src/data/mockData.ts` — it
doesn't call the backend yet. Wiring the two together (replacing that file
with real API calls to `backend/`) is the next step; see "Not yet wired"
below.

## Why they're separate folders, not one merged app

React (Vite dev server, port 5173) and Django (port 8000) are two separate
processes even in production — the frontend gets built to static files and
served from Vercel/S3, the backend runs on Render. Keeping them as sibling
folders in one repo is the standard way to develop them together without
merging their tooling (npm vs pip, Vite config vs Django settings) into one
confusing setup.

## Status

| Piece | Status |
|---|---|
| Frontend UI | Built, matches the HealthNow mockup, running on mock data |
| Backend API | Built and tested (auth, records, insurance claim estimator, emergency QR all verified with real requests) |
| Database | SQLite locally; `DATABASE_URL` in `backend/.env` ready for the Neon connection string when provided |
| AI (Claude) | Service layer built (`backend/ai/claude_service.py`); returns clearly-marked mock responses until `ANTHROPIC_API_KEY` is set |
| OCR, SMS gateway | Same pattern — mocked until provider keys are supplied |
| **Frontend ↔ Backend wiring** | **Not yet done** — this is the next step |

## Not yet wired (next step)

Right now these are two working projects sitting next to each other, not
one connected app. To actually connect them:

1. Start the backend (`python manage.py runserver`) and the frontend
   (`npm run dev`) at the same time.
2. In `frontend/src/data/mockData.ts`, each exported constant needs to
   become a TanStack Query hook calling the matching backend endpoint
   (documented in `backend/README.md`) instead of a static value.
3. Add an auth flow to the frontend — currently the family-profile switcher
   in the top bar is UI-only; it needs to call `/api/auth/send-otp/` and
   `/api/auth/verify-otp/`, store the returned JWT, and send it as
   `Authorization: Bearer <token>` on every other request.
4. `backend/.env`'s `CORS_ALLOWED_ORIGINS` already includes
   `http://localhost:5173`, so no CORS changes should be needed for local dev.

Say the word and this is the next thing to build.
