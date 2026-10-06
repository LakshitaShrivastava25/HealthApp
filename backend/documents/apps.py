from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    name = 'documents'

    def ready(self):
        from . import signals  # noqa: F401 — deletes stored files with their rows
