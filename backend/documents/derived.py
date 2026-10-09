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
    Rebuilds what this document implies, and returns (events, medicine
    lines) counts.

    Timeline events are deleted and recreated: they are pure projections
    with nothing hanging off them, so rebuilding is always safe.

    Medicines go through medicines/consolidation.py. This document's
    prescription lines (MedicationOccurrence) are replaced, then the whole
    profile's medicine list is recomputed — one Medication per medicine
    however many prescriptions mention it. Medication rows themselves are
    never deleted there (reminders hang off them); duplicates are merged and
    reminders follow the surviving row.

    A document that is a copy of another (duplicate_of) contributes
    nothing: the original already put its events and medicines on record,
    and a second set would be exactly the duplication this prevents.
    """
    from documents.models import TimelineEvent
    from medicines.consolidation import rebuild_profile_medications, replace_document_occurrences

    data = document.structured_data if isinstance(document.structured_data, dict) else {}

    TimelineEvent.objects.filter(source_document=document).delete()

    if document.duplicate_of_id:
        replace_document_occurrences(document)  # clears any it had
        rebuild_profile_medications(document.profile)
        return 0, 0

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

    # 4. Medicines prescribed — one line per medicine on this document, then
    #    the profile's consolidated list (medicines/consolidation.py).
    lines = replace_document_occurrences(document)
    rebuild_profile_medications(document.profile)
    return len(events), lines
