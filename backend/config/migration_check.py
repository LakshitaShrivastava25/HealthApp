"""
Data commands (backfills, rebuilds) need the schema their code expects.

Run before the deploy that applies their migrations, they used to die with a
raw "column ... does not exist" traceback — and since a local .env can point
at the production database, which database was missing what was not obvious.
This turns that into a plain explanation before anything is read or written.
"""

from django.core.management.base import CommandError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


def require_migrations(*app_labels):
    """Raises CommandError if this database lacks any migration of these apps."""
    executor = MigrationExecutor(connection)
    plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
    pending = sorted(f'{migration.app_label}.{migration.name}' for migration, _ in plan
                     if migration.app_label in app_labels)
    if pending:
        database = connection.settings_dict.get('HOST') or connection.settings_dict.get('NAME')
        raise CommandError(
            f"The database at {database} does not have these migrations yet: {', '.join(pending)}. "
            'Deploy the backend first (its deploy must run `python manage.py migrate`), then run '
            'this command again. Nothing was read or changed.'
        )
