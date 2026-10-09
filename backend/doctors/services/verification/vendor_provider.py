"""
Optional fallback: a paid KYC vendor that verifies NMC registrations
(e.g. Surepass, Decentro). Off unless both DOCTOR_VERIFY_VENDOR_URL and
DOCTOR_VERIFY_VENDOR_TOKEN are set, and only tried when NMC itself is
unreachable.

No vendor has been signed up for, so the request and response formats are
not filled in — see the TODOs. Until they are, a configured vendor reports
"unavailable" and the doctor waits in the admin queue as usual.
"""

import json
import logging
import time
import urllib.error
import urllib.request

from django.conf import settings

from .base import UNAVAILABLE, VerificationResult

logger = logging.getLogger(__name__)


class VendorProvider:
    name = 'vendor'

    def __init__(self):
        self.url = settings.DOCTOR_VERIFY_VENDOR_URL
        self.token = settings.DOCTOR_VERIFY_VENDOR_TOKEN
        self.timeout = settings.NMC_TIMEOUT

    @property
    def configured(self) -> bool:
        return bool(self.url and self.token)

    def verify(self, reg_no: str, council: str, year: int | None = None, attempts: int = 1) -> VerificationResult:
        started = time.monotonic()
        # TODO(vendor): replace with the vendor's documented request body —
        # field names and the council format (most vendors take the council
        # NAME, Surepass also the registration year).
        body = {'registration_number': reg_no, 'state_council': council, 'year': year}
        request = urllib.request.Request(
            self.url,
            data=json.dumps(body).encode(),
            headers={'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode('utf-8'))
            result = self._map(payload)
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as exc:
            result = VerificationResult(status=UNAVAILABLE, provider=self.name, error=f'vendor: {exc}')
        logger.info(
            'Vendor verify reg=%s council=%s status=%s provider=%s %.1fs',
            reg_no, council, result.status, self.name, time.monotonic() - started,
        )
        return result

    def _map(self, payload: dict) -> VerificationResult:
        # TODO(vendor): map the vendor's response to VerificationResult —
        # status (found / not_found), name, qualification, university,
        # registration_date, registration_year, is_suspended — and set `raw`
        # to the response with personal fields (date of birth, address,
        # phone, email, Aadhaar) removed. Fill this in from the vendor's docs
        # once there is an account; until then nothing is concluded from it.
        return VerificationResult(
            status=UNAVAILABLE, provider=self.name, error='vendor response mapping not implemented yet',
        )
