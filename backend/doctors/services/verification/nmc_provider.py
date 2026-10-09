"""
Lookups against the National Medical Commission's Indian Medical Register.

These are the JSON endpoints behind NMC's own register search page
(https://nmc.org.in/information-desk/indian-medical-register/). They are
undocumented and unsupported — NMC redesigned its site in 2026 and the older
/MCIRest endpoints, along with every third-party scraper built on them,
stopped working — so everything here is defensive:

  GET {NMC_BASE_URL}/search?search_type=advance&reg_no=&state=<council code>
      Registration-number search. Matches by SUBSTRING ("12345" also finds
      "2001123450"), so rows are filtered to an exact number and council.
      Each row carries the whole record, including personal fields that are
      stripped before anything is stored (see _scrub).
  GET {NMC_BASE_URL}/black-list-doctors/search?state=&reg_no=
      Doctors removed from the register; restored_on of 1900-01-01 means
      not restored.

Only single lookups, made when a doctor registers, an admin re-checks, or the
background job's gentle pass runs — never bulk scraping or pagination.
"""

import json
import logging
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from django.conf import settings

from ...councils import council_name
from .base import AMBIGUOUS, FOUND, NOT_FOUND, UNAVAILABLE, ProviderUnavailable, VerificationResult

logger = logging.getLogger(__name__)

USER_AGENT = 'CuraPath-DoctorVerification/1.0 (+https://curapath.in)'

# Kept from a register record; everything else (date of birth, permanent
# address, father's name, and anything NMC adds later) is dropped.
KEPT_FIELDS = (
    'id', 'uprn_no', 'name', 'registration_no', 'registration_date', 'year_of_info',
    'state_code', 'state_medical_council', 'qualification', 'qualification_year',
    'university', 'additional_qualifications', 'removed_status', 'removed_on',
    'restored_on', 'remarks',
)
KEPT_QUALIFICATION_FIELDS = ('qualification', 'year', 'university')

NOT_RESTORED = '1900-01-01'


def _scrub(record: dict) -> dict:
    """A register record with only the fields an admin needs to verify a doctor."""
    kept = {key: record.get(key) for key in KEPT_FIELDS if key in record}
    extra = kept.get('additional_qualifications')
    if isinstance(extra, list):
        kept['additional_qualifications'] = [
            {k: q.get(k) for k in KEPT_QUALIFICATION_FIELDS} for q in extra if isinstance(q, dict)
        ]
    elif extra is not None:
        kept['additional_qualifications'] = []
    return kept


def comparable(reg_no) -> str:
    """Registration numbers compared on letters and digits only, leading zeros dropped."""
    return re.sub(r'[^0-9A-Z]', '', str(reg_no or '').upper()).lstrip('0')


def _parse_date(value):
    text = str(value or '').strip()
    for fmt in ('%d-%m-%Y', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _is_removed(record: dict) -> bool:
    """Removed from the register and not restored."""
    status = str(record.get('removed_status') or '').strip().lower()
    if status in ('', '0', 'none', 'null', 'false', 'n', 'no'):
        return False
    restored = str(record.get('restored_on') or '').strip()
    return not restored or restored.startswith(NOT_RESTORED) or restored.lower() == 'not disposed off'


def _year(value):
    try:
        return int(str(value).strip()[:4])
    except (TypeError, ValueError):
        return None


class NMCProvider:
    name = 'nmc'

    def __init__(self):
        self.base_url = settings.NMC_BASE_URL.rstrip('/')
        self.timeout = settings.NMC_TIMEOUT
        self.context = ssl.create_default_context()
        # NMC's TLS chain has been known to omit its intermediate certificate.
        # Rather than ever turning verification off, an extra CA bundle can be
        # supplied (e.g. the Sectigo intermediate, saved as a .pem).
        if settings.NMC_CA_BUNDLE:
            self.context.load_verify_locations(cafile=settings.NMC_CA_BUNDLE)

    # -- HTTP ---------------------------------------------------------------

    def _get(self, path: str, params: dict, attempts: int) -> dict:
        url = f'{self.base_url}/{path}?{urllib.parse.urlencode(params)}'
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
        last_error = 'unknown error'
        for attempt in range(attempts):
            if attempt:
                time.sleep(2 ** (attempt - 1))  # 1s, then 2s
            try:
                with urllib.request.urlopen(request, timeout=self.timeout, context=self.context) as response:
                    payload = json.loads(response.read().decode('utf-8'))
            except urllib.error.HTTPError as exc:
                last_error = f'HTTP {exc.code}'
                if exc.code < 500 and exc.code != 429:
                    break  # a 4xx won't change on retry
                continue
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                reason = getattr(exc, 'reason', exc)
                last_error = f'{type(reason).__name__}: {reason}'
                continue
            except ValueError:
                last_error = 'response was not JSON'
                break
            if not isinstance(payload, dict) or payload.get('success') is False:
                last_error = 'register answered without success'
                break
            return payload
        raise ProviderUnavailable(last_error)

    # -- lookups ------------------------------------------------------------

    def _exact_rows(self, payload: dict, reg_no: str, council: str) -> list[dict]:
        rows = payload.get('data')
        if not isinstance(rows, list):
            raise ProviderUnavailable('unexpected response shape')
        wanted = comparable(reg_no)
        name = council_name(council).lower()
        return [
            row for row in rows
            if isinstance(row, dict)
            and comparable(row.get('registration_no')) == wanted
            and (str(row.get('state_code') or '').upper() == council
                 or str(row.get('state_medical_council') or '').strip().lower() == name)
        ]

    def check_suspension(self, reg_no: str, council: str, attempts: int = 3) -> tuple[bool, str]:
        """(listed as removed and not restored, remarks) from NMC's blacklist."""
        payload = self._get(
            'black-list-doctors/search',
            {'state': council, 'reg_no': reg_no, 'page': 1, 'per_page': 50},
            attempts,
        )
        for row in self._exact_rows(payload, reg_no, council):
            # Every row here is a removal; restored_on says whether it still stands.
            if _is_removed({**row, 'removed_status': row.get('removed_status') or '1'}):
                when = _parse_date(row.get('removed_on'))
                note = 'Listed as removed from the register' + (f' on {when:%d %b %Y}' if when else '') + '.'
                return True, f'{note} {str(row.get("remarks") or "").strip()}'.strip()
        return False, ''

    def verify(self, reg_no: str, council: str, year: int | None = None, attempts: int = 3) -> VerificationResult:
        started = time.monotonic()
        try:
            payload = self._get(
                'search',
                {'search_type': 'advance', 'reg_no': reg_no, 'state': council, 'page': 1, 'per_page': 50},
                attempts,
            )
            rows = self._exact_rows(payload, reg_no, council)
            if len(rows) > 1 and year:
                rows = [r for r in rows if _year(r.get('year_of_info')) == year] or rows
            if not rows:
                result = VerificationResult(status=NOT_FOUND, provider=self.name)
            elif len(rows) > 1:
                result = VerificationResult(
                    status=AMBIGUOUS, provider=self.name,
                    raw={'matches': [_scrub(r) for r in rows[:5]]},
                    error=f'{len(rows)} entries share this number in {council_name(council)}.',
                )
            else:
                record = rows[0]
                suspended, remarks = _is_removed(record), ''
                if suspended:
                    when = _parse_date(record.get('removed_on'))
                    remarks = f'Listed as removed from the register{f" on {when:%d %b %Y}" if when else ""}.'
                try:
                    listed, listed_remarks = self.check_suspension(reg_no, council, attempts=1)
                    if listed:
                        suspended, remarks = True, listed_remarks or remarks
                except ProviderUnavailable as exc:
                    # The record itself still says whether it was removed; a
                    # blacklist outage shouldn't sink the whole check.
                    logger.warning('NMC blacklist lookup failed for reg %s (%s): %s', reg_no, council, exc)
                result = VerificationResult(
                    status=FOUND,
                    provider=self.name,
                    nmc_doctor_id=str(record.get('id') or ''),
                    name=str(record.get('name') or '').strip(),
                    qualification=' '.join(
                        str(part) for part in (record.get('qualification'), record.get('qualification_year')) if part
                    ),
                    university=str(record.get('university') or '').strip(),
                    registration_date=_parse_date(record.get('registration_date')),
                    registration_year=_year(record.get('year_of_info')),
                    is_suspended=suspended,
                    suspension_remarks=remarks,
                    raw=_scrub(record),
                )
        except ProviderUnavailable as exc:
            result = VerificationResult(status=UNAVAILABLE, provider=self.name, error=str(exc))
        logger.info(
            'NMC verify reg=%s council=%s status=%s provider=%s %.1fs',
            reg_no, council, result.status, self.name, time.monotonic() - started,
        )
        return result
