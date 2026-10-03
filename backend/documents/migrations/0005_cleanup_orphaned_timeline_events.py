"""
Removes TimelineEvent rows left behind by the old SET_NULL behaviour.

Until 0004 changed source_document to CASCADE, deleting a document left its
timeline entry standing with source_document NULL. /api/timeline/ is
read-only, so those entries could never be removed by the person who owned
them: their health timeline kept showing a report that no longer existed,
with no way to clear it.

Deliberately spares the demo account. seed_demo.py creates two events that
legitimately have no document — a Typhoid diagnosis and an allergy record —
which are authored in their own right rather than derived from a file. Those
are real seeded content, not debris, and deleting them would quietly break
`manage.py seed_demo`'s expected result.

Data-only: no schema change. The reverse is a no-op because deleted rows
cannot be reconstructed — there is nothing left to point them at.
"""

from django.db import migrations


# seed_demo.py's login. Matched on the account rather than the profile name
# so renaming the demo profile cannot turn its events into deletion targets.
DEMO_PHONE = '+919876500000'


def delete_orphaned_timeline_events(apps, schema_editor):
    """
    One pass over events with no source document, skipping the demo account.

    Scoped by `source_document__isnull=True` rather than by date or title:
    an event that still points at a document is current by definition, and
    one that does not is unreachable debris regardless of when it was made.
    """
    TimelineEvent = apps.get_model('documents', 'TimelineEvent')

    orphaned = TimelineEvent.objects.filter(source_document__isnull=True).exclude(
        profile__account__phone_number=DEMO_PHONE
    )
    removed = orphaned.count()
    orphaned.delete()
    print('  removed %d orphaned timeline event(s)' % removed)


def noop_reverse(apps, schema_editor):
    """Nothing to restore — the rows and the documents they described are gone."""


class Migration(migrations.Migration):

    dependencies = [('documents', '0004_alter_timelineevent_source_document')]

    operations = [
        migrations.RunPython(delete_orphaned_timeline_events, noop_reverse),
    ]
