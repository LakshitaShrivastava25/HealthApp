"""
One real lookup against the NMC register, to check it works from wherever
this runs (locally, or on Render's shell):

    python manage.py nmc_smoke_test <registration number> <council code>
    python manage.py nmc_smoke_test 2001123450 MAH

Prints the parsed result with personal fields already removed. Nothing is
saved and the cache is bypassed.
"""

import json
import time

from django.core.management.base import BaseCommand, CommandError

from doctors.councils import COUNCIL_NAMES, council_name
from doctors.services.verification.base import ProviderUnavailable
from doctors.services.verification.nmc_provider import NMCProvider


class Command(BaseCommand):
    help = 'Make one real NMC register lookup and print the parsed, personal-data-free result.'

    def add_arguments(self, parser):
        parser.add_argument('registration_number')
        parser.add_argument('council', help='Council code, e.g. MAH, DEL, KAR (see doctors/councils.py).')

    def handle(self, registration_number, council, **options):
        council = council.upper()
        if council not in COUNCIL_NAMES:
            raise CommandError(f'Unknown council code {council!r}. One of: {", ".join(sorted(COUNCIL_NAMES))}')
        provider = NMCProvider()
        self.stdout.write(f'Register: {provider.base_url}')
        self.stdout.write(f'Looking up {registration_number} in {council_name(council)} ...')

        started = time.monotonic()
        result = provider.verify(registration_number, council, attempts=1)
        self.stdout.write(f'Search: {result.status} in {time.monotonic() - started:.1f}s')
        shown = result.to_cache()
        shown.pop('raw', None)
        self.stdout.write(json.dumps(shown, indent=2, ensure_ascii=False))
        if result.raw:
            self.stdout.write('Stored register fields (personal data removed): ' + ', '.join(sorted(result.raw)))

        started = time.monotonic()
        try:
            listed, remarks = provider.check_suspension(registration_number, council, attempts=1)
            self.stdout.write(
                f'Removed-doctors list: {"LISTED — " + remarks if listed else "not listed"} '
                f'({time.monotonic() - started:.1f}s)'
            )
        except ProviderUnavailable as exc:
            self.stdout.write(f'Removed-doctors list: unreachable ({exc})')
