"""
Fallback: Decentro's NMC professional-verification API — a commercial KYC
service with an SLA (https://docs.decentro.tech, "Professional Verification
- NMC").

  POST {DECENTRO_BASE_URL}/v2/kyc/professional-verification/nmc
  headers: client_id, client_secret
  body:    reference_id, consent, purpose (> 20 chars), member_id,
           state_council (council NAME), year_of_admission, member_name

It answers in the older NMC API's shape (registrationNo, smcName,
removedStatus …), read by parsers.parse_mci_record. "No record" is a 404
with responseKey "error_no_record_found"; responseCode is "S00000" on both
success and failure, so it is never used to decide anything.

Needs the doctor's consent (Decentro requires it by regulation, and so do
we for any outside partner) and their registration year. Off unless both
DECENTRO_CLIENT_ID and DECENTRO_CLIENT_SECRET are set; staging is the
default base URL until production access is granted.
"""

import logging
import time

from django.conf import settings

from ...councils import council_name, register_council_name
from .base import AMBIGUOUS, FOUND, NOT_FOUND, UNAVAILABLE, Lookup, ProviderUnavailable, VerificationResult
from .parsers import parse_mci_record, same_number
from .transport import post_json

logger = logging.getLogger(__name__)

PATH = '/v2/kyc/professional-verification/nmc'
PURPOSE = 'Verification of doctor registration for CuraPath onboarding'
NO_RECORD = 'error_no_record_found'


class DecentroProvider:
    name = 'decentro'
    label = 'Decentro'
    third_party = True

    def __init__(self):
        self.base_url = settings.DECENTRO_BASE_URL.rstrip('/')
        self.client_id = settings.DECENTRO_CLIENT_ID
        self.client_secret = settings.DECENTRO_CLIENT_SECRET
        self.timeout = settings.DECENTRO_TIMEOUT

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def skip_reason(self, q: Lookup) -> str:
        return '' if q.year else 'needs the year of registration'

    def request_body(self, q: Lookup) -> dict:
        body = {
            # Unique per request, and traceable back to the doctor.
            'reference_id': f'cp-doc-{q.reference or "check"}-{time.time_ns() // 1_000_000}',
            'consent': True,
            'purpose': PURPOSE,
            'member_id': q.reg_no,
            'state_council': register_council_name(q.council),
            'year_of_admission': str(q.year or ''),
        }
        if q.name:
            body['member_name'] = q.name
        return body

    def verify(self, q: Lookup, attempts: int = 1) -> VerificationResult:
        started = time.monotonic()
        txn = ''
        try:
            status, payload = post_json(
                self.base_url + PATH,
                self.request_body(q),
                {'client_id': self.client_id, 'client_secret': self.client_secret},
                self.timeout,
            )
            if not isinstance(payload, dict):
                raise ProviderUnavailable(f'HTTP {status}, response was not JSON')
            txn = str(payload.get('decentroTxnId') or '')
            result = self._map(status, payload, q)
        except ProviderUnavailable as exc:
            result = VerificationResult(status=UNAVAILABLE, provider=self.name, error=f'decentro: {exc}')
        # The transaction id is what Decentro support asks for; the payload
        # itself (with the doctor's address) is never logged.
        logger.info(
            'Decentro verify reg=%s council=%s status=%s txn=%s %.1fs',
            q.reg_no, q.council, result.status, txn or '-', time.monotonic() - started,
        )
        return result

    def _map(self, http_status: int, payload: dict, q: Lookup) -> VerificationResult:
        txn = payload.get('decentroTxnId')
        if payload.get('responseKey') == NO_RECORD:
            return VerificationResult(status=NOT_FOUND, provider=self.name, raw={'decentroTxnId': txn})
        data = payload.get('data')
        if str(payload.get('status')).upper() != 'SUCCESS' or not isinstance(data, list) or not data:
            detail = payload.get('responseKey') or payload.get('message') or 'unexpected answer'
            raise ProviderUnavailable(f'HTTP {http_status}, {str(detail)[:200]}')

        names = {register_council_name(q.council).lower(), council_name(q.council).lower()}
        rows = [
            row for row in data
            if isinstance(row, dict)
            and same_number(q.reg_no, row.get('registrationNo'))
            and (not row.get('smcName') or str(row['smcName']).strip().lower() in names)
        ]
        parsed = [parse_mci_record(row) for row in rows]
        if len(parsed) > 1 and q.year:
            parsed = [p for p in parsed if p['registration_year'] == q.year] or parsed
        if not parsed:
            return VerificationResult(
                status=NOT_FOUND, provider=self.name, raw={'decentroTxnId': txn},
                error=f'Decentro returned {len(data)} record(s), none for this number and council.',
            )
        if len(parsed) > 1:
            return VerificationResult(
                status=AMBIGUOUS, provider=self.name,
                raw={'decentroTxnId': txn, 'matches': [p['raw'] for p in parsed[:5]]},
                error=f'{len(parsed)} entries share this number in {council_name(q.council)}.',
            )
        record = parsed[0]
        return VerificationResult(
            status=FOUND,
            provider=self.name,
            suspension_remarks='Listed as removed from the register.' if record['is_suspended'] else '',
            **{**record, 'raw': {**record['raw'], 'decentroTxnId': txn}},
        )
