"""
Keeps a document's Timeline entry in step with the document itself.

TimelineEvent is a read model (see its docstring in models.py): every row is
derived from something else rather than authored on its own. seed_demo.py has
always created the pair together — a Document and a matching TimelineEvent —
which is why seeded documents show up on the Health Timeline. The real
upload -> AI-process -> confirm flow never created one at all, so a genuinely
uploaded document was processed and then simply never appeared in the person's
history. Confirmed live on a real profile whose only document was PROCESSED
while /api/timeline/ returned nothing.

The field shape here deliberately mirrors what seed_demo.py writes, so a
seeded event and a real one are indistinguishable on the Timeline.
"""

from django.utils import timezone

from .models import Document, TimelineEvent


def _event_date(document):
    """
    TimelineEvent.event_date is NOT NULL, but Document.document_date is
    optional — the AI cannot always find a date, and the review screen lets
    someone leave it blank. Such a document still belongs on the timeline, so
    it is dated from when it entered the record rather than dropped.
    """
    if document.document_date:
        return document.document_date
    stamp = document.processed_at or document.uploaded_at or timezone.now()
    return timezone.localdate(stamp)


def _event_fields(document):
    """
    event_type is the raw category string, exactly as seed_demo.py writes it —
    the Timeline's own style map (HealthTimeline.tsx) is keyed on
    report/prescription/scan/discharge, so anything else would silently lose
    its colour, icon and badge.

    summary falls back to the doctor when there is no hospital: a prescription
    normally carries only a doctor's name, and the seeded events leave that
    second line blank in exactly that case.
    """
    return {
        'profile': document.profile,
        'event_date': _event_date(document),
        'event_type': document.category,
        'title': document.title or document.get_category_display(),
        'summary': document.hospital_name or document.doctor_name or '',
    }


def sync_timeline_event(document):
    """
    Create — or update — the single timeline entry mirroring this document.

    Only a PROCESSED document belongs on the timeline. That is the point at
    which a person has reviewed the AI's reading and confirmed it, and it is
    the status every seeded document carries; anything still processing,
    awaiting review or failed has nothing confirmed to show. Called on a
    document in any other state this is a no-op.

    Idempotent, and an update rather than an insert when a row already exists,
    so correcting a misread title on the review screen fixes the timeline too
    instead of leaving the typo there for good. Returns the event, or None.
    """
    if document.status != Document.Status.PROCESSED:
        return None

    fields = _event_fields(document)
    event = document.timeline_events.first()
    if event is None:
        return TimelineEvent.objects.create(source_document=document, **fields)

    for name, value in fields.items():
        setattr(event, name, value)
    event.save(update_fields=list(fields))
    return event


def remove_timeline_event(document):
    """
    Drop the mirrored entry when its document is deleted.

    source_document is SET_NULL, which is right for the hand-written events
    seed_demo.py creates (a diagnosis, an allergy) — those are authored in
    their own right and outlive any file. A row that exists only to mirror a
    document is different: /api/timeline/ is read-only, so an orphan left
    behind by a deleted upload could never be removed by the person who owns
    it, and would sit in their history pointing at a file that is gone.
    """
    document.timeline_events.all().delete()
