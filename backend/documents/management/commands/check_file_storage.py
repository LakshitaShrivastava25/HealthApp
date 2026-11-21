import secrets

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Test the configured storage backend: upload, download, verify and delete.'

    def handle(self, *args, **options):
        storage = default_storage
        backend = type(storage).__name__
        self.stdout.write(f'Storage backend: {backend}')

        name = f'storage-check/{secrets.token_hex(16)}.txt'
        payload = f'CuraPath storage test {secrets.token_hex(16)}'.encode()
        uploaded = False

        try:
            saved_name = storage.save(name, ContentFile(payload))
            uploaded = True
            with storage.open(saved_name, 'rb') as fh:
                data = fh.read()
            if data != payload:
                raise CommandError('Downloaded file does not match what was uploaded.')
            if not storage.exists(saved_name):
                raise CommandError('Uploaded file is not reported as existing.')
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(f'Storage round-trip failed: {type(exc).__name__}: {exc}')
        finally:
            if uploaded:
                try:
                    storage.delete(saved_name)
                except Exception as exc:
                    self.stderr.write(f'Could not delete test file: {exc}')

        self.stdout.write(self.style.SUCCESS(f'Storage round-trip OK ({backend}).'))
