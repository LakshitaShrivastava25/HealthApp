# Task: real notification generation for premium renewals + medicine reminders

Backend only, as requested tonight — no frontend changes.

## Why this matters

Two pieces of real data already exist but do nothing: InsurancePolicy's
premium_due_date (added earlier tonight, currently only used for a
frontend "days left" display) and Medication reminder times (used only
by the AI health assistant to answer questions). Neither actually
*notifies* anyone of anything. This task makes that data real by
generating actual Notification records — a management command you can
run now to prove it works, ready to be wired to a real scheduler
(cron / Celery-beat) later in production, which this task does NOT set
up (that's a deployment decision for later, not something to guess at
now).

My own sandbox is still reset from earlier tonight, so — same pattern
as the last two tasks — confirm real field names by reading the actual
files before writing new code that depends on them. Getting a
related_name or field name subtly wrong here would fail silently or
crash, not get caught by a superficial review.

## Steps

1. **Read first, don't assume.** View these three files in full:
   - `backend/insurance/models.py` — confirm the exact field name for
     the premium due date on InsurancePolicy (added earlier tonight,
     should be something like `premium_due_date`) and how it relates
     to `profile`.
   - `backend/medicines/models.py` — confirm the exact model names and
     field names for medications and their reminder schedules (added
     earlier tonight — a Medication model with an `is_active` field,
     and a related reminder-schedule model with a `time_of_day` field
     and an `is_active` field of its own, linked via some related_name
     — confirm the exact related_name rather than guessing).
   - `backend/family/models.py` — confirm the exact Profile model
     fields you'll need (id, full_name at minimum).

2. **Create a new Notification model.** Put it in whichever existing
   app makes the most sense given what you find (family/ is a
   reasonable default if nothing better fits) — fields:
   - `profile` — FK to Profile
   - `notification_type` — CharField with choices, at least
     `'premium_due'` and `'medicine_reminder'`
   - `title` — CharField
   - `message` — CharField or TextField
   - `related_id` — CharField or UUIDField, storing the id of the
     policy or medication this notification is about (needed for the
     idempotency check in step 3 — don't skip this field)
   - `is_read` — BooleanField, default False
   - `created_at` — DateTimeField, auto_now_add=True
   Generate and apply the migration.

3. **Write a management command** (e.g.
   `backend/family/management/commands/generate_reminders.py`) that:
   - For every InsurancePolicy with a `premium_due_date` within the
     next 14 days (matching the "urgent" threshold already used in the
     frontend's red-highlight logic from earlier tonight — stay
     consistent with that, don't invent a different number) AND in the
     future or today (not already overdue-and-ignored — use your
     judgment on whether an overdue one should still notify; lean
     toward still notifying, since a missed payment is more urgent, not
     less): create a Notification with notification_type='premium_due',
     related_id=the policy's id, a clear title/message naming the
     insurer and the due date.
   - For every active Medication with an active reminder whose
     time_of_day falls within the current 5-minute window (i.e., this
     command is meant to be run frequently, like every 5 minutes, by a
     future scheduler): create a Notification with
     notification_type='medicine_reminder', related_id=the medication's
     id, naming the medicine and dosage.
   - **Idempotency is required, not optional**: before creating a
     notification, check whether one with the same
     notification_type + related_id + profile already exists from
     roughly the same time window (e.g., created within the last hour
     for a medicine reminder, or created at all for the same policy's
     premium_due notification within the current 14-day window) —
     otherwise running this command repeatedly (as it's meant to be)
     would spam duplicate notifications. Use clear judgement here and
     explain your idempotency logic in a code comment.
   - Print a summary of how many notifications were created when run.

4. **Add a minimal read-only API endpoint** to list notifications for a
   profile — `GET /api/notifications/?profile_id=<id>`, following the
   same query-param pattern already used by documents/timeline/
   allergies (confirm that exact pattern by checking how one of those
   existing endpoints filters by profile_id, and match it). Also add a
   `POST /api/notifications/<id>/mark_read/` action. Wire it into
   `backend/config/urls.py` following the existing router pattern.

## Final check

Activate the venv first:
```
cd backend
venv\Scripts\activate
python manage.py makemigrations
python manage.py migrate
python manage.py check
```
Must show no errors, and the migration must actually be created and
applied (confirm the "Applying..." line appears).

## Recommended verification — this needs to be real, not assumed

1. Using the real database (your actual Neon database — this is
   real data, be careful, but this task only creates new rows, it
   doesn't touch existing ones): find or create a real InsurancePolicy
   with premium_due_date set to within the next 14 days, and a real
   active Medication with a reminder time set to within the next few
   minutes of when you're actually running this (adjust the reminder
   time to match your real current time so the test can actually fire).
2. Run `python manage.py generate_reminders` and confirm it reports
   creating at least one notification of each type.
3. Run it a SECOND time immediately after, and confirm it does NOT
   create duplicates — this is the idempotency check, and it's the
   part most likely to be subtly wrong, so verify it explicitly rather
   than assuming the logic works.
4. Call the new GET endpoint with a real request and confirm the
   notifications actually come back with correct data.
5. Call the mark_read action and confirm is_read actually flips.

## Report back precisely

Since I could not pre-verify this one locally:
- The exact field/related_name names you confirmed from each of the
  three model files, before you wrote anything that depends on them.
- The full migration output.
- The two consecutive `generate_reminders` runs, showing the count
  created each time (first run > 0, second run = 0 new).
- The real GET and mark_read responses.
- The Django check result.
