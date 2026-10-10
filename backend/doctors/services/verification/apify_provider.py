"""
Fallback: the community "NMC Doctor Lookup" actor on Apify
(https://apify.com/whoareyouanas/nmc-doctor-lookup), run synchronously.

It reads the same NMC register, but from Apify's servers — so it helps when
NMC is blocking or timing out on our host, not when NMC itself is down. A
run takes 10–60 s, so it is only ever asked from the background job
(manage.py reverify_doctors), never while a doctor waits on a request.

Caveat, checked 2026-10-10: the actor's page says it calls NMC's older
/MCIRest endpoints, which NMC retired in its 2026 redesign (they answer 404).
Unless the actor has been updated it will report "error" for every lookup,
which maps to "unavailable" — harmless, but not useful. Check it with
`manage.py nmc_smoke_test <reg> <council> --provider apify` before relying
on it. Billed per result (from $5 per 1,000).

Off unless APIFY_TOKEN is set; asked only for doctors who consented to
outside verification partners.
"""

import logging
import time

from django.conf import settings

from ...councils import register_council_name
from .base import AMBIGUOUS, FOUND, NOT_FOUND, UNAVAILABLE, Lookup, ProviderUnavailable, VerificationResult
from .parsers import parse_date, strip_pii, year_of
from .transport import post_json

logger = logging.getLogger(__name__)

ACTOR_URL = 'https://api.apify.com/v2/acts/whoareyouanas~nmc-doctor-lookup/run-sync-get-dataset-items'

# Kept from the actor's answer. dateOfBirth, address, uprnNo and parentName
# are never stored.
KEPT_FIELDS = (
    'status', 'isValid', 'doctorName', 'registrationId', 'nmcDoctorId', 'stateMedicalCouncil',
    'registrationDate', 'yearInfo', 'qualification', 'qualificationYear', 'university',
    'additionalQualifications', 'source', 'sourceUrl', 'checkedAt',
)


class ApifyProvider:
    name = 'apify'
    label = 'Apify NMC lookup'
    third_party = True

    def __init__(self):
        self.token = settings.APIFY_TOKEN
        self.timeout = settings.APIFY_TIMEOUT

    @property
    def configured(self) -> bool:
        return bool(self.token)

    def skip_reason(self, q: Lookup) -> str:
        return ''

    def verify(self, q: Lookup, attempts: int = 1) -> VerificationResult:
        started = time.monotonic()
        body = {
            'registrationId': q.reg_no,
            'stateMedicalCouncil': register_council_name(q.council),
            'includeRaw': False,
            'requestTimeoutSecs': 60,
            'maxRetries': 2,
        }
        try:
            # The token goes in a header, not the ?token= query string, so it
            # never lands in a URL that something might log.
            status, items = post_json(ACTOR_URL, body, {'Authorization': f'Bearer {self.token}'}, self.timeout)
            if status not in (200, 201):
                raise ProviderUnavailable(f'HTTP {status}')
            items = [item for item in items or [] if isinstance(item, dict)] if isinstance(items, list) else []
            if not items:
                raise ProviderUnavailable('the actor returned no result')
            result = self._map(items[0])
        except ProviderUnavailable as exc:
            result = VerificationResult(status=UNAVAILABLE, provider=self.name, error=f'apify: {exc}')
        logger.info(
            'Apify verify reg=%s council=%s status=%s %.1fs',
            q.reg_no, q.council, result.status, time.monotonic() - started,
        )
        return result

    def _map(self, item: dict) -> VerificationResult:
        status = str(item.get('status') or '').lower()
        if status in ('valid', 'restored', 'removed'):
            removed = status == 'removed'
            return VerificationResult(
                status=FOUND,
                provider=self.name,
                nmc_doctor_id=str(item.get('nmcDoctorId') or ''),
                name=' '.join(str(item.get('doctorName') or '').split()),
                qualification=' '.join(
                    str(part) for part in (item.get('qualification'), item.get('qualificationYear')) if part
                ),
                university=str(item.get('university') or '').strip(),
                registration_date=parse_date(item.get('registrationDate')),
                registration_year=year_of(item.get('yearInfo')),
                is_suspended=removed,
                suspension_remarks='Listed as removed from the register.' if removed else '',
                raw=strip_pii({key: item.get(key) for key in KEPT_FIELDS if key in item}),
            )
        if status == 'not_found':
            return VerificationResult(status=NOT_FOUND, provider=self.name)
        if status == 'ambiguous':
            return VerificationResult(
                status=AMBIGUOUS, provider=self.name, error='Several register entries share this number.',
            )
        detail = str(item.get('error') or item.get('message') or status or 'unknown status')[:200]
        raise ProviderUnavailable(f'lookup error ({detail})')
