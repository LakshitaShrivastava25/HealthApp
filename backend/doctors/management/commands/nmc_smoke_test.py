"""
Real lookups against the register, to check verification works from wherever
this runs (locally, or on Render's shell):

    python manage.py nmc_smoke_test <registration number> <council code>
    python manage.py nmc_smoke_test 5892 MAD --try-councils MAD,MCI --year 2003
    python manage.py nmc_smoke_test 5892 MAD --year 2003 --provider decentro
    python manage.py nmc_smoke_test 5892 MAD --year 2003 --provider all

For NMC it shows each raw answer first — HTTP status, content type and the
start of the body — then every row the search returned BEFORE the exact
number/council filter, then the parsed result. That separates "NMC is
blocking this host" (403, HTML, timeout) from "the number isn't there" from
"our filter dropped it". Personal fields (date of birth, address, father's
name) are removed before anything is printed. Nothing is saved and the
cache is bypassed.

--provider apify / decentro make one real, billed call each.
"""

import json
import time

from django.core.management.base import BaseCommand, CommandError

from doctors.councils import COUNCIL_NAMES, council_name
from doctors.services.verification import PROVIDERS
from doctors.services.verification.base import Lookup, ProviderUnavailable
from doctors.services.verification.nmc_provider import PER_PAGE, NMCProvider
from doctors.services.verification.parsers import same_number, strip_pii


class Command(BaseCommand):
    help = 'Make real register lookups and print what came back, personal data removed.'

    def add_arguments(self, parser):
        parser.add_argument('registration_number')
        parser.add_argument('council', help='Council code, e.g. MAH, DEL, KAR (see doctors/councils.py).')
        parser.add_argument('--try-councils', default='',
                            help='Comma-separated council codes to try in turn instead of just COUNCIL.')
        parser.add_argument('--year', type=int, default=None, help='Year of registration (Decentro needs it).')
        parser.add_argument('--provider', default='nmc', choices=[*PROVIDERS, 'all'],
                            help='Which provider to ask (default nmc). Outside providers are billed per call.')

    def handle(self, registration_number, council, try_councils='', year=None, provider='nmc', **options):
        councils = [c.strip().upper() for c in (try_councils or council).split(',') if c.strip()]
        unknown = [c for c in councils if c not in COUNCIL_NAMES]
        if unknown:
            raise CommandError(f'Unknown council code(s) {unknown}. One of: {", ".join(sorted(COUNCIL_NAMES))}')
        names = list(PROVIDERS) if provider == 'all' else [provider]

        for code in councils:
            self.stdout.write(self.style.MIGRATE_HEADING(f'\n=== {registration_number} in {council_name(code)} ({code})'))
            q = Lookup(reg_no=registration_number, council=code, year=year, consent=True, reference='smoke-test')
            for name in names:
                if name == 'nmc':
                    self._nmc(q)
                else:
                    self._outside(PROVIDERS[name](), q)

    # -- NMC ------------------------------------------------------------------

    def _nmc(self, q: Lookup):
        provider = NMCProvider()
        self.stdout.write(f'Register: {provider.base_url}')
        params = {'search_type': 'advance', 'reg_no': q.reg_no, 'state': q.council, 'page': 1, 'per_page': PER_PAGE}
        started = time.monotonic()
        status, content_type, body = provider.probe('search', params)
        self.stdout.write(
            f'Raw answer: HTTP {status or "none"} | {content_type or "no content type"} | '
            f'{len(body)} chars | {time.monotonic() - started:.1f}s'
        )
        try:
            payload = json.loads(body)
        except ValueError:
            # Not JSON — an HTML block page or an error; no register data in it.
            self.stdout.write('Body (not JSON — NMC blocking or erroring, treated as "unavailable"):')
            self.stdout.write('  ' + body[:500].replace('\n', ' '))
            return
        self.stdout.write('Body, personal fields removed (first 500 chars):')
        self.stdout.write('  ' + json.dumps(strip_pii(payload), ensure_ascii=False)[:500])

        rows = payload.get('data') if isinstance(payload, dict) else None
        if isinstance(rows, list):
            self.stdout.write(f'Rows before filtering: {len(rows)} (pagination: {payload.get("pagination")})')
            for row in rows[:25]:
                if not isinstance(row, dict):
                    self.stdout.write(f'  [not an object] {str(row)[:80]}')
                    continue
                self.stdout.write(
                    f'  {"EXACT " if same_number(q.reg_no, row.get("registration_no")) else "      "}'
                    f'{row.get("registration_no")!s:<18} {row.get("state_code")!s:<4} '
                    f'{row.get("year_of_info")!s:<5} removed={row.get("removed_status")!s:<5} {row.get("name")}'
                )

        started = time.monotonic()
        result = provider.verify(q, attempts=1)
        self.stdout.write(self.style.SUCCESS(f'Parsed result: {result.status} in {time.monotonic() - started:.1f}s'))
        self._print_result(result)

        started = time.monotonic()
        try:
            listed, remarks = provider.check_suspension(q.reg_no, q.council, attempts=1)
            self.stdout.write(
                f'Removed-doctors list: {"LISTED — " + remarks if listed else "not listed"} '
                f'({time.monotonic() - started:.1f}s)'
            )
        except ProviderUnavailable as exc:
            self.stdout.write(f'Removed-doctors list: unreachable ({exc})')

    # -- outside providers ----------------------------------------------------

    def _outside(self, provider, q: Lookup):
        self.stdout.write(f'\n--- {provider.label} ---')
        if not provider.configured:
            self.stdout.write('Not configured (credentials unset) — skipped.')
            return
        reason = provider.skip_reason(q)
        if reason:
            self.stdout.write(f'Skipped: {reason} (pass --year).')
            return
        started = time.monotonic()
        result = provider.verify(q)
        self.stdout.write(self.style.SUCCESS(f'Result: {result.status} in {time.monotonic() - started:.1f}s'))
        self._print_result(result)

    def _print_result(self, result):
        shown = result.to_cache()
        raw = shown.pop('raw', None)
        shown.pop('attempts', None)
        self.stdout.write(json.dumps(shown, indent=2, ensure_ascii=False, default=str))
        if raw:
            self.stdout.write('Stored fields (personal data removed): ' + ', '.join(sorted(raw)))
