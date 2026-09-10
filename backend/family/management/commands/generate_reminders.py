"""
Generates real Notification rows from data that already exists but
previously notified nobody: InsurancePolicy.premium_due_date and
ReminderSchedule.time_of_day.

Meant to be run frequently (every ~5 minutes) by a scheduler — cron or
Celery-beat — which this project does NOT yet set up; that's a
deployment decision. Running it by hand does exactly what the scheduler
would do, which is what makes it verifiable today.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from family.models import Notification

# Same threshold the frontend already uses to turn a due date red, so a
# person doesn't get notified on a different schedule from what the UI
# has been telling them is urgent.
PREMIUM_WINDOW_DAYS = 14

# How often this command is expected to run. A reminder fires if its
# time_of_day falls anywhere in the window that just elapsed, so no
# reminder is missed between two consecutive runs.
RUN_INTERVAL_MINUTES = 5

WEEKDAY_ABBR = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']


class Command(BaseCommand):
    help = "Generate premium-due and medicine-reminder notifications."

    def handle(self, *args, **options):
        now = timezone.localtime()
        premium_created = self._generate_premium_due(now)
        medicine_created = self._generate_medicine_reminders(now)

        total = premium_created + medicine_created
        self.stdout.write(
            f"premium_due notifications created:       {premium_created}\n"
            f"medicine_reminder notifications created: {medicine_created}\n"
            f"total created:                           {total}"
        )

    # -- premium renewals ------------------------------------------------
    def _generate_premium_due(self, now):
        from insurance.models import InsurancePolicy

        today = now.date()
        cutoff = today + timedelta(days=PREMIUM_WINDOW_DAYS)

        # No lower bound on purpose: an already-overdue premium is more
        # urgent than an upcoming one, not less, so it keeps notifying.
        policies = InsurancePolicy.objects.filter(
            premium_due_date__isnull=False, premium_due_date__lte=cutoff
        ).select_related('profile')

        created = 0
        for policy in policies:
            # Idempotency: at most one premium reminder per policy per
            # 14-day window. Re-running this command every 5 minutes must
            # not produce a new row each time, and a renewal reminder is
            # only useful once per window — not 288 times a day.
            already = Notification.objects.filter(
                profile=policy.profile,
                notification_type=Notification.Type.PREMIUM_DUE,
                related_id=policy.id,
                created_at__gte=now - timedelta(days=PREMIUM_WINDOW_DAYS),
            ).exists()
            if already:
                continue

            insurer = policy.insurer or 'Your insurance policy'
            days_left = (policy.premium_due_date - today).days
            if days_left < 0:
                title = f"{insurer} premium is overdue"
                message = (
                    f"The premium for {insurer} was due on {policy.premium_due_date} "
                    f"({abs(days_left)} day{'' if abs(days_left) == 1 else 's'} ago). "
                    f"Pay it to keep the policy active."
                )
            elif days_left == 0:
                title = f"{insurer} premium is due today"
                message = f"The premium for {insurer} is due today, {policy.premium_due_date}."
            else:
                title = f"{insurer} premium due in {days_left} day{'' if days_left == 1 else 's'}"
                message = (
                    f"The premium for {insurer} is due on {policy.premium_due_date}, "
                    f"in {days_left} day{'' if days_left == 1 else 's'}."
                )

            Notification.objects.create(
                profile=policy.profile,
                notification_type=Notification.Type.PREMIUM_DUE,
                title=title,
                message=message,
                related_id=policy.id,
            )
            created += 1
        return created

    # -- medicine reminders ----------------------------------------------
    def _generate_medicine_reminders(self, now):
        from medicines.models import ReminderSchedule

        window_end = now.time()
        window_start = (now - timedelta(minutes=RUN_INTERVAL_MINUTES)).time()
        today_abbr = WEEKDAY_ABBR[now.weekday()]

        reminders = ReminderSchedule.objects.filter(
            is_active=True, medication__is_active=True
        ).select_related('medication', 'medication__profile')

        created = 0
        for reminder in reminders:
            if not self._in_window(reminder.time_of_day, window_start, window_end):
                continue
            if not self._scheduled_today(reminder.days_of_week, today_abbr):
                continue

            medication = reminder.medication

            # Idempotency: one reminder per medicine per hour. The 5-minute
            # windows of two consecutive runs can overlap at the edges, and
            # a medicine with several daily times (8am/2pm/8pm) must still
            # be able to fire again later in the day — an hour is wide
            # enough to swallow duplicate runs, narrow enough not to
            # suppress the next genuine dose.
            already = Notification.objects.filter(
                profile=medication.profile,
                notification_type=Notification.Type.MEDICINE_REMINDER,
                related_id=medication.id,
                created_at__gte=now - timedelta(hours=1),
            ).exists()
            if already:
                continue

            dosage = f" ({medication.dosage})" if medication.dosage else ""
            instructions = f" — {medication.instructions}" if medication.instructions else ""
            Notification.objects.create(
                profile=medication.profile,
                notification_type=Notification.Type.MEDICINE_REMINDER,
                title=f"Time for {medication.name}",
                message=(
                    f"It's {reminder.time_of_day.strftime('%H:%M')} — time to take "
                    f"{medication.name}{dosage}{instructions}."
                ),
                related_id=medication.id,
            )
            created += 1
        return created

    @staticmethod
    def _in_window(value, start, end):
        # start > end means the window straddles midnight (e.g. 23:57–00:02).
        if start <= end:
            return start <= value <= end
        return value >= start or value <= end

    @staticmethod
    def _scheduled_today(days_of_week, today_abbr):
        # 'daily', or a comma list like 'mon,thu'. Firing a Monday-only
        # reminder every day would be a real bug, so this is respected
        # even though the task description didn't mention the field.
        spec = (days_of_week or 'daily').strip().lower()
        if spec in ('', 'daily'):
            return True
        return today_abbr in [d.strip() for d in spec.split(',')]
