"""
The read models built FROM an uploaded document: Timeline events and
Medications.

Before this existed, nothing in the running application ever created a
TimelineEvent or a Medication — the only code that did was the demo seed
command. So the Health Timeline was permanently empty for any real account,
and a prescription never produced the medicines it prescribed. The models
and the screens were both already there; the step between them was missing.

Deliberately independent of whether AI extraction succeeded. An uploaded
document is itself a real health event with a real date, so it earns a
timeline entry even when no key is configured and nothing could be read out
of it. Anything the extraction *did* find is added on top.
"""

from datetime import date


def _parse_iso_date(value):
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def _as_list(value):
    """
    Extraction output is not guaranteed to match the prompt's schema. A
    field documented as a list can come back as a bare string, or null.
    Normalising here keeps every caller below free of isinstance checks.
    """
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def _clean(text, limit):
    return str(text).strip()[:limit] if text else ''


def rebuild_derived_records(document):
    """
    Rebuilds what this document implies, and returns (events, medicines)
    counts.

    Timeline events are deleted and recreated: they are pure projections
    with nothing hanging off them, so rebuilding is always safe.

    Medications are only ever ADDED, never deleted. A Medication owns its
    ReminderSchedule rows through a cascading foreign key, so deleting one
    to rebuild it would silently destroy reminder times the person set by
    hand. Matching on (profile, source_document, name) means re-processing
    the same document is idempotent without touching anything the person
    has since built on top of it.
    """
    from documents.models import TimelineEvent
    from medicines.models import Medication

    data = document.structured_data if isinstance(document.structured_data, dict) else {}

    TimelineEvent.objects.filter(source_document=document).delete()

    event_date = (
        document.document_date
        or _parse_iso_date(data.get('date'))
        or document.uploaded_at.date()
    )

    events = []
    source_label = ' · '.join(
        part for part in (document.hospital_name, document.doctor_name) if part
    )

    # 1. The document itself.
    events.append(
        TimelineEvent(
            profile=document.profile,
            source_document=document,
            event_date=event_date,
            event_type=document.category,
            title=_clean(document.title, 255) or f'{document.get_category_display()} added',
            summary=_clean(source_label or data.get('summary'), 500),
        )
    )

    # 2. Diagnoses named in the document.
    for diagnosis in _as_list(data.get('diagnosis')):
        name = _clean(diagnosis if isinstance(diagnosis, str) else diagnosis.get('name'), 255)
        if not name:
            continue
        events.append(
            TimelineEvent(
                profile=document.profile,
                source_document=document,
                event_date=event_date,
                event_type='diagnosis',
                title=name,
                summary=_clean(source_label, 500),
            )
        )

    # 3. Tests ordered or reported.
    for test in _as_list(data.get('tests')):
        name = _clean(test if isinstance(test, str) else test.get('name'), 255)
        if not name:
            continue
        events.append(
            TimelineEvent(
                profile=document.profile,
                source_document=document,
                event_date=event_date,
                event_type='test',
                title=name,
                summary=_clean(source_label, 500),
            )
        )

    TimelineEvent.objects.bulk_create(events)

    # 4. Medicines prescribed.
    created_medicines = 0
    for medicine in _as_list(data.get('medicines')):
        if isinstance(medicine, str):
            medicine = {'name': medicine}
        if not isinstance(medicine, dict):
            continue
        name = _clean(medicine.get('name'), 150)
        if not name:
            continue
        _, created = Medication.objects.get_or_create(
            profile=document.profile,
            source_document=document,
            name=name,
            defaults={
                'dosage': _clean(medicine.get('dosage'), 100),
                'frequency': _clean(medicine.get('frequency'), 100),
                'instructions': _clean(medicine.get('instructions'), 255),
                'start_date': _parse_iso_date(medicine.get('start_date')) or event_date,
                'end_date': _parse_iso_date(medicine.get('end_date')),
                # A medicine read off a prescription is presumed current.
                # The person can end it from the Medicines screen; nothing
                # here should decide on its own that a drug was stopped.
                'is_active': True,
            },
        )
        if created:
            created_medicines += 1

    return len(events), created_medicines
