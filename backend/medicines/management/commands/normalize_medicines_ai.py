from django.core.management.base import BaseCommand, CommandError

from ai.claude_service import ClaudeService
from config.migration_check import require_migrations
from family.models import Profile
from medicines.consolidation import rebuild_profile_medications
from medicines.models import MedicationOccurrence


class Command(BaseCommand):
    help = (
        'Ask the AI once per profile for the generic name, brand, strength, form and release of '
        'medicine lines read before extraction returned them. Only fills empty fields — nothing '
        'a document said is overwritten. Dry run by default; --apply to save and re-consolidate.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--profile', help='Only this profile id.')

    def handle(self, *args, **options):
        require_migrations('documents', 'medicines')
        service = ClaudeService()
        if not service.enabled:
            raise CommandError('ANTHROPIC_API_KEY is not set.')

        profiles = Profile.objects.filter(medication_occurrences__generic_name='').distinct()
        if options['profile']:
            profiles = profiles.filter(pk=options['profile'])

        for profile in profiles:
            lines = list(MedicationOccurrence.objects.filter(profile=profile, generic_name=''))
            distinct = {}
            for line in lines:
                distinct.setdefault((line.name, line.dosage), []).append(line)
            request = [{'name': name, 'dosage': dosage} for name, dosage in distinct]
            result = service.normalize_medicine_names(request)
            if result.get('_extraction_failed'):
                self.stdout.write(self.style.WARNING(f'profile …{str(profile.pk)[-4:]}: {result.get("note")}'))
                continue
            answers = result.get('medicines') or []
            if len(answers) != len(request):
                self.stdout.write(self.style.WARNING(
                    f'profile …{str(profile.pk)[-4:]}: got {len(answers)} answers for {len(request)} names; skipped'
                ))
                continue

            changed = []
            for (key, group), answer in zip(distinct.items(), answers):
                if not isinstance(answer, dict) or answer.get('name') != key[0]:
                    continue
                self.stdout.write(
                    f'  {key[0]!r} → generic={answer.get("generic_name")!r} brand={answer.get("brand_name")!r} '
                    f'release={answer.get("release")!r}'
                )
                for line in group:
                    for field, limit in (('generic_name', 255), ('brand_name', 150), ('strength', 100),
                                         ('form', 50), ('route', 30), ('release', 30)):
                        value = answer.get(field)
                        if value and not getattr(line, field):
                            setattr(line, field, str(value)[:limit])
                    changed.append(line)

            if options['apply'] and changed:
                MedicationOccurrence.objects.bulk_update(
                    changed, ['generic_name', 'brand_name', 'strength', 'form', 'route', 'release']
                )
                rebuild_profile_medications(profile)
            self.stdout.write(self.style.SUCCESS(
                f'profile …{str(profile.pk)[-4:]}: {len(changed)} line(s) '
                + ('updated' if options['apply'] else 'would be updated (dry run)')
            ))
