from django.core.management.base import BaseCommand
from django.db import transaction

from config.migration_check import require_migrations
from family.models import Profile
from medicines.consolidation import rebuild_profile_medications
from medicines.models import Medication


class _Rollback(Exception):
    pass


class Command(BaseCommand):
    help = (
        'Consolidate every profile\'s medicines (one row per medicine, with status and history). '
        'Dry run by default: prints the before/after and rolls back. Pass --apply to keep it.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the result (default is a dry run).')
        parser.add_argument('--profile', help='Only this profile id.')
        parser.add_argument('--quiet', action='store_true', help='Totals only, no per-medicine lines.')

    def handle(self, *args, **options):
        require_migrations('documents', 'medicines')
        profiles = Profile.objects.all().order_by('id')
        if options['profile']:
            profiles = profiles.filter(pk=options['profile'])
        mode = 'APPLY' if options['apply'] else 'DRY RUN (nothing is saved)'
        self.stdout.write(self.style.MIGRATE_HEADING(f'Rebuilding medicines — {mode}'))

        before_total = after_total = 0
        try:
            with transaction.atomic():
                for profile in profiles:
                    before = Medication.objects.filter(profile=profile, merged_into__isnull=True, is_archived=False).count()
                    if not before and not profile.documents.exists():
                        continue
                    visible = rebuild_profile_medications(profile)
                    current = [m for m in visible if m.is_active]
                    before_total += before
                    after_total += len(visible)
                    self.stdout.write(
                        f'profile …{str(profile.pk)[-4:]}: {before} rows → {len(visible)} medicines '
                        f'({len(current)} current, {len(visible) - len(current)} past)'
                    )
                    if not options['quiet']:
                        for medication in sorted(visible, key=lambda m: (not m.is_active, m.name.lower())):
                            self.stdout.write(
                                f'    [{medication.status:12}] {medication.name} — {medication.status_reason}'
                            )
                            for suggestion in medication.possible_duplicates:
                                self.stdout.write(f'        ? {suggestion["name"]}: {suggestion["reason"]}')
                if not options['apply']:
                    raise _Rollback()
        except _Rollback:
            pass
        self.stdout.write(self.style.SUCCESS(
            f'Total: {before_total} rows → {after_total} medicines'
            + ('' if options['apply'] else ' (dry run — rolled back)')
        ))
