from django.apps import AppConfig


class PushConfig(AppConfig):
    name = 'push'

    def ready(self):
        from . import signals  # noqa: F401 — connects the event hooks
