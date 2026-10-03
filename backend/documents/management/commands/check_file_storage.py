import secrets

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        'Round-trip a small file through the configured storage (upload, read '
        'back, delete) to prove the Cloudinary keys work before deploying.'
    )

    def handle(self, *args, **options):
        backend = settings.STORAGES['default']['BACKEND'].rsplit('.', 1)[-1]
        self.stdout.write(f'Storage backend: {backend}')
        if not settings.USE_CLOUDINARY:
            self.stdout.write(self.style.WARNING(
                'Cloudinary keys not found — set CLOUDINARY_URL, or CLOUDINARY_CLOUD_NAME + '
                'CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET.'
            ))
            return
        self.stdout.write(f'Cloud name: {settings.CLOUDINARY_CLOUD_NAME}')

        payload = f'curapath storage check {secrets.token_hex(8)}'.encode()
        try:
            name = default_storage.save('storage-check/check.txt', ContentFile(payload))
            self.stdout.write(f'Uploaded as {name}')
            with default_storage.open(name) as fh:
                read_back = fh.read()
            if read_back != payload:
                raise CommandError(f'Read back different bytes than were uploaded: {read_back[:80]!r}')
            self.stdout.write('Read back the same bytes through a signed download link')
            default_storage.delete(name)
            self.stdout.write('Deleted the test file')
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(f'{type(exc).__name__}: {exc}') from exc
        self.stdout.write(self.style.SUCCESS('Cloudinary storage works.'))
