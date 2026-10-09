"""
Re-checks doctors against the NMC register, gently.

    python manage.py reverify_doctors                 # pending / unreachable ones
    python manage.py reverify_doctors --audit-verified  # verified doctors: still on the register?

One lookup at a time with a pause in between, at most --limit per run — NMC
is a public service, not ours to hammer. Nothing here approves or rejects:
results go to the admin queue (and a verified doctor now listed as removed
goes back into it, pausing their patient access until an admin decides).

No Celery here, so schedule it as a Render cron job every 6 hours, e.g.
    command:  python manage.py reverify_doctors && python manage.py reverify_doctors --audit-verified
"""

import time

from django.core.management.base import BaseCommand

from doctors.models import Doctor
from doctors.services.verification import apply_verification
from doctors.services.verification.base import ProviderUnavailable
from doctors.services.verification.nmc_provider import NMCProvider


class Command(BaseCommand):
    help = 'Re-check pending/unreachable doctors on the NMC register; --audit-verified checks verified ones for removal.'

    def add_arguments(self, parser):
        parser.add_argument('--audit-verified', action='store_true',
                            help='Check verified doctors against the removed-doctors list only.')
        parser.add_argument('--limit', type=int, default=100, help='Most doctors to check in one run (default 100).')
        parser.add_argument('--pause', type=float, default=2.0, help='Seconds between lookups (default 2).')

    def handle(self, *args, audit_verified=False, limit=100, pause=2.0, **options):
        if audit_verified:
            return self._audit(limit, pause)

        S = Doctor.VerificationStatus
        doctors = (
            Doctor.objects.filter(verification_status__in=[S.PENDING, S.FAILED])
            .exclude(registration_number='').exclude(state_council_id='')
            .order_by('nmc_checked_at', 'submitted_at')[:limit]
        )
        counts = {}
        for i, doctor in enumerate(doctors):
            if i:
                time.sleep(pause)
            apply_verification(doctor, use_cache=False)
            counts[doctor.nmc_result] = counts.get(doctor.nmc_result, 0) + 1
        self.stdout.write(f'Re-checked {sum(counts.values())} doctor(s): {counts or "none waiting"}')

    def _audit(self, limit, pause):
        provider = NMCProvider()
        doctors = (
            Doctor.objects.filter(verification_status=Doctor.VerificationStatus.VERIFIED)
            .exclude(registration_number='').exclude(state_council_id='')
            .order_by('nmc_checked_at')[:limit]
        )
        flagged = checked = 0
        for i, doctor in enumerate(doctors):
            if i:
                time.sleep(pause)
            try:
                listed, remarks = provider.check_suspension(doctor.registration_number, doctor.state_council_id)
            except ProviderUnavailable as exc:
                self.stderr.write(f'Register unreachable, stopping the audit: {exc}')
                break
            checked += 1
            if listed:
                # A full re-check records the removal and sends the doctor
                # back to the admin queue.
                apply_verification(doctor, use_cache=False)
                flagged += 1
        self.stdout.write(f'Audited {checked} verified doctor(s); {flagged} listed as removed and sent to admin review.')
