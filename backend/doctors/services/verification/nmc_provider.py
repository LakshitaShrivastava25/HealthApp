"""
Lookups against the National Medical Commission's Indian Medical Register.

These are the JSON endpoints behind NMC's own register search page
(https://nmc.org.in/information-desk/indian-medical-register/). They are
undocumented and unsupported — NMC redesigned its site in 2026 and the older
/MCIRest endpoints, along with every third-party scraper built on them,
stopped working — so everything here is defensive:

  GET {NMC_BASE_URL}/search?search_type=advance&reg_no=&state=<council code>
      Registration-number search. Matches by SUBSTRING ("12345" also finds
      "2001123450"), so rows are filtered to an exact number and council
      (parsers.same_number — some councils store a prefix, "DMC/R/11030").
      At most 100 rows a page; a short number can have its exact match on a
      later page, so up to NMC_MAX_PAGES pages are read before concluding
      "not found". With state= empty it searches every council, which is how
      a number filed under a different council is spotted.
      Each row carries the whole record, including personal fields that are
      stripped before anything is stored (see _scrub).
  GET {NMC_BASE_URL}/black-list-doctors/search?state=&reg_no=
      Doctors removed from the register; restored_on of 1900-01-01 means
      not restored.

Only single lookups, made when a doctor registers, an admin re-checks, or the
background job's gentle pass runs — never bulk scraping.
"""

import json
import logging
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

from ...councils import council_name
from .base import AMBIGUOUS, FOUND, NOT_FOUND, UNAVAILABLE, Lookup, ProviderUnavailable, VerificationResult
from .parsers import parse_date, same_number, truthy, year_of

logger = logging.getLogger(__name__)

USER_AGENT = 'CuraPath-DoctorVerification/1.0 (+https://curapath.in)'

# Kept from a register record; everything else (date of birth, permanent
# address, father's name, and anything NMC adds later) is dropped.
KEPT_FIELDS = (
    'id', 'name', 'registration_no', 'registration_date', 'year_of_info',
    'state_code', 'state_medical_council', 'qualification', 'qualification_year',
    'university', 'additional_qualifications', 'removed_status', 'removed_on',
    'restored_on', 'remarks',
)
KEPT_QUALIFICATION_FIELDS = ('qualification', 'year', 'university')

NOT_RESTORED = '1900-01-01'
PER_PAGE = 100  # the register's own maximum


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


def _is_removed(record: dict) -> bool:
    """Removed from the register and not restored."""
    if not truthy(record.get('removed_status')):
        return False
    restored = str(record.get('restored_on') or '').strip()
    return not restored or restored.startswith(NOT_RESTORED) or restored.lower() == 'not disposed off'


class NMCProvider:
    name = 'nmc'
    label = 'NMC register'
    third_party = False
    configured = True

    def skip_reason(self, q: Lookup) -> str:
        return ''

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

    def probe(self, path: str, params: dict) -> tuple[int | None, str, str]:
        """One raw request, no retries: (HTTP status, content type, body text). For the smoke test."""
        url = f'{self.base_url}/{path}?{urllib.parse.urlencode(params)}'
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout, context=self.context) as response:
                body = response.read().decode('utf-8', 'replace')
                return response.status, response.headers.get('Content-Type', ''), body
        except urllib.error.HTTPError as exc:
            return exc.code, (exc.headers or {}).get('Content-Type', ''), exc.read().decode('utf-8', 'replace')
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            return None, '', f'{type(exc).__name__}: {getattr(exc, "reason", exc)}'

    # -- lookups ------------------------------------------------------------

    @staticmethod
    def _rows(payload: dict) -> list[dict]:
        rows = payload.get('data')
        if not isinstance(rows, list):
            raise ProviderUnavailable('unexpected response shape')
        return [row for row in rows if isinstance(row, dict)]

    @staticmethod
    def _exact(rows: list[dict], reg_no: str, council: str | None) -> list[dict]:
        """Rows for exactly this number — in `council`, or in any council when it is None."""
        name = council_name(council).lower() if council else ''
        return [
            row for row in rows
            if same_number(reg_no, row.get('registration_no'))
            and (council is None
                 or str(row.get('state_code') or '').upper() == council
                 or str(row.get('state_medical_council') or '').strip().lower() == name)
        ]

    def _search(self, path: str, reg_no: str, council: str | None, attempts: int) -> list[dict]:
        """Exact rows for the number, reading further pages only while none has turned up."""
        params = {'reg_no': reg_no, 'state': council or '', 'per_page': PER_PAGE}
        if path == 'search':
            params['search_type'] = 'advance'
        page = 1
        while True:
            payload = self._get(path, {**params, 'page': page}, attempts)
            exact = self._exact(self._rows(payload), reg_no, council)
            pages = (payload.get('pagination') or {}).get('total_pages') or 1
            if exact or page >= min(pages, max(1, settings.NMC_MAX_PAGES)):
                return exact
            page += 1

    def other_councils(self, reg_no: str, council: str, attempts: int = 1) -> list[dict]:
        """The same number listed under other councils — a hint for the doctor and the admin."""
        found = []
        for row in self._search('search', reg_no, None, attempts):
            code = str(row.get('state_code') or '').upper()
            if code and code != council:
                found.append({
                    'council': code,
                    'council_name': council_name(code),
                    'registration_no': str(row.get('registration_no') or ''),
                    'year': year_of(row.get('year_of_info')),
                })
        return found[:5]

    def check_suspension(self, reg_no: str, council: str, attempts: int = 3) -> tuple[bool, str]:
        """(listed as removed and not restored, remarks) from NMC's blacklist."""
        for row in self._search('black-list-doctors/search', reg_no, council, attempts):
            # Every row here is a removal; restored_on says whether it still stands.
            if _is_removed({**row, 'removed_status': row.get('removed_status') or '1'}):
                when = parse_date(row.get('removed_on'))
                note = 'Listed as removed from the register' + (f' on {when:%d %b %Y}' if when else '') + '.'
                return True, f'{note} {str(row.get("remarks") or "").strip()}'.strip()
        return False, ''

    def verify(self, q: Lookup, attempts: int = 3) -> VerificationResult:
        reg_no, council, year = q.reg_no, q.council, q.year
        started = time.monotonic()
        try:
            rows = self._search('search', reg_no, council, attempts)
            if len(rows) > 1 and year:
                rows = [r for r in rows if year_of(r.get('year_of_info')) == year] or rows
            if not rows:
                result = VerificationResult(status=NOT_FOUND, provider=self.name)
                try:
                    result.other_councils = self.other_councils(reg_no, council)
                except ProviderUnavailable as exc:
                    logger.warning('NMC all-council lookup failed for reg %s: %s', reg_no, exc)
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
                    when = parse_date(record.get('removed_on'))
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
                    registration_date=parse_date(record.get('registration_date')),
                    registration_year=year_of(record.get('year_of_info')),
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
