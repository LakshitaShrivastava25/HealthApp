"""
Backfills the Timeline entry for every document that was already confirmed
before documents/timeline.py existed.

Until now nothing in the real upload -> process -> confirm flow created a
TimelineEvent, so any document a person actually uploaded reached PROCESSED
and then never appeared in their Health Timeline. Only seed_demo.py wrote the
Document/TimelineEvent pair, which is why demo data looked fine. Fixing the
write path forward only would leave those already-confirmed documents
invisible for good, with no way for the person to fix it themselves —
/api/timeline/ is read-only.

Data-only: no schema change. TimelineEvent.source_document already exists, so
no new field and no column is needed to link an event back to its document.
"""

from django.db import migrations
from django.utils import timezone


# Repeated here rather than imported from documents.models: a migration must
# read through the historical model, and Document.Category could change later.
CATEGORY_LABELS = {
    'prescription': 'Prescription',
    'report': 'Report',
    'scan': 'Scan',
    'discharge': 'Discharge Summary',
    'other': 'Other',
}


def backfill_timeline_events(apps, schema_editor):
    """
    One event per PROCESSED document that has none, built from the document's
    own fields — the same shape documents/timeline.py writes going forward and
    seed_demo.py has always written.

    Documents that already have an event are skipped, so this is safe to
    re-run, and documents still processing / awaiting review / failed are left
    alone: nothing about them has been confirmed yet.
    """
    Document = apps.get_model('documents', 'Document')
    TimelineEvent = apps.get_model('documents', 'TimelineEvent')

    created = 0
    for document in Document.objects.filter(status='processed'):
        if TimelineEvent.objects.filter(source_document=document).exists():
            continue

        event_date = document.document_date
        if not event_date:
            # event_date is NOT NULL but document_date is optional — fall back
            # to when the document entered the record.
            stamp = document.processed_at or document.uploaded_at or timezone.now()
            event_date = timezone.localdate(stamp)

        TimelineEvent.objects.create(
            profile=document.profile,
            source_document=document,
            event_date=event_date,
            event_type=document.category,
            title=document.title or CATEGORY_LABELS.get(document.category, 'Document'),
            summary=document.hospital_name or document.doctor_name or '',
        )
        created += 1

    print('  backfilled %d timeline event(s) for already-confirmed documents' % created)


def remove_backfilled_events(apps, schema_editor):
    """
    Reversing drops only events that mirror a document. The hand-written ones
    seed_demo.py creates (diagnosis, allergy) have no source_document and are
    left untouched.
    """
    TimelineEvent = apps.get_model('documents', 'TimelineEvent')
    TimelineEvent.objects.filter(source_document__isnull=False).delete()


class Migration(migrations.Migration):

    dependencies = [('documents', '0001_initial')]

    operations = [
        migrations.RunPython(backfill_timeline_events, remove_backfilled_events),
    ]
