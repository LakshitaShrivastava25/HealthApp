from pathlib import Path

from django.conf import settings
from django.core.files.base import File
from django.core.management.base import BaseCommand

from documents.models import StoredFile
from documents.storage import DatabaseStorage


class Command(BaseCommand):
    help = (
        'Copy files from MEDIA_ROOT into database storage, keeping their names, '
        'so records uploaded before the switch keep working. Skips files already stored.'
    )

    def handle(self, *args, **options):
        root = Path(settings.MEDIA_ROOT)
        storage = DatabaseStorage()
        copied = skipped = 0
        for path in root.rglob('*') if root.exists() else []:
            if not path.is_file():
                continue
            name = path.relative_to(root).as_posix()
            if StoredFile.objects.filter(name=name).exists():
                skipped += 1
                continue
            with path.open('rb') as fh:
                storage._save(name, File(fh))
            copied += 1
        self.stdout.write(self.style.SUCCESS(f'Copied {copied} file(s), skipped {skipped} already stored.'))
