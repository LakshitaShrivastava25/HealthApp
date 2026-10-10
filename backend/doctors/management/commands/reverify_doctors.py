"""
Re-checks doctors against the NMC register, gently, through the whole
provider chain (NMC, then the outside fallbacks — see
doctors/services/verification).

    python manage.py reverify_doctors                 # doctors waiting on a check
    python manage.py reverify_doctors --audit-verified  # verified doctors: still on the register?

Who is "waiting on a check":
  - pending / register-unreachable doctors, and
  - doctors under review whose number NMC couldn't find, once for each
    configured fallback provider they haven't been through yet (so setting
    DECENTRO_CLIENT_ID later re-checks them once, not every run).

One lookup at a time with a pause in between, at most --limit per run — NMC
is a public service, not ours to hammer, and the fallbacks are paid. Nothing
here approves or rejects: results go to the admin queue (and a verified
doctor now listed as removed goes back into it, pausing their patient access
until an admin decides).

No Celery here, so schedule it as a Render cron job every 6 hours, e.g.
    command:  python manage.py reverify_doctors && python manage.py reverify_doctors --audit-verified
"""

import time

from django.core.management.base import BaseCommand

from doctors.models import Doctor
from doctors.services.verification import FULL, apply_verification, provider_chain
from doctors.services.verification.base import Lookup, ProviderUnavailable
from doctors.services.verification.nmc_provider import NMCProvider


def fallbacks_pending(doctor: Doctor, fallbacks) -> bool:
    """Whether a configured outside provider could still be asked about this doctor."""
    if doctor.verification_consent_at is None:
        return False
    asked = {a.get('provider') for a in doctor.provider_attempts or [] if a.get('result') != 'skipped'}
    q = Lookup(reg_no=doctor.registration_number, council=doctor.state_council_id,
               year=doctor.registration_year, consent=True)
    return any(p.name not in asked and not p.skip_reason(q) for p in fallbacks)


class Command(BaseCommand):
    help = 'Re-check doctors waiting on the register through every provider; --audit-verified checks verified ones for removal.'

    def add_arguments(self, parser):
        parser.add_argument('--audit-verified', action='store_true',
                            help='Check verified doctors against the removed-doctors list only.')
        parser.add_argument('--limit', type=int, default=50, help='Most doctors to check in one run (default 50).')
        parser.add_argument('--pause', type=float, default=2.0, help='Seconds between lookups (default 2).')

    def handle(self, *args, audit_verified=False, limit=50, pause=2.0, **options):
        if audit_verified:
            return self._audit(limit, pause)

        counts = {}
        for i, doctor in enumerate(self._waiting(limit)):
            if i:
                time.sleep(pause)
            apply_verification(doctor, providers=FULL, use_cache=False)
            counts[doctor.nmc_result] = counts.get(doctor.nmc_result, 0) + 1
        self.stdout.write(f'Re-checked {sum(counts.values())} doctor(s): {counts or "none waiting"}')

    def _waiting(self, limit):
        S = Doctor.VerificationStatus
        checkable = Doctor.objects.exclude(registration_number='').exclude(state_council_id='')
        waiting = list(
            checkable.filter(verification_status__in=[S.PENDING, S.FAILED])
            .order_by('nmc_checked_at', 'submitted_at')[:limit]
        )
        fallbacks = [p for p in provider_chain(FULL) if p.third_party]
        if fallbacks and len(waiting) < limit:
            not_found = (
                checkable.filter(verification_status=S.MANUAL_REVIEW, nmc_result=Doctor.NMCResult.NOT_FOUND)
                .exclude(verification_consent_at=None)
                .order_by('nmc_checked_at')
            )
            for doctor in not_found.iterator():
                if len(waiting) >= limit:
                    break
                if fallbacks_pending(doctor, fallbacks):
                    waiting.append(doctor)
        return waiting

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
