"""
One medicine, one row — however many prescriptions mention it.

Every prescription line becomes a MedicationOccurrence (replace_document_
occurrences). rebuild_profile_medications then groups a profile's lines by
medicine identity (medicines/normalize.py), keeps exactly one Medication per
medicine, and works out its status from what the doctors actually wrote.

Status rules, in order — every status carries its evidence (date, doctor,
quoted instruction) in status_reason:

  1. The person's own "stopped" / "still taking" wins until a prescription
     dated after it arrives.
  2. The latest prescription explicitly stops it        -> discontinued.
  3. Prescriptions within a couple of days disagree     -> needs review
     (stop vs continue, or different doses from different doctors).
  4. A one-time dose (STAT)                             -> one-time.
     A stated course length that has run out            -> course completed.
  5. Dose or frequency differs from the previous visit  -> modified.
  6. Otherwise continued (seen on more than one date, or explicitly
     "continue") or active.

A medicine that is merely absent from newer prescriptions is NEVER marked
discontinued — doctors often list only what they prescribe themselves.
Instead newer_prescriptions_without counts those prescriptions, so the apps
can ask "still taking it?".

The rebuild is a full, idempotent recomputation per profile: cheap at this
scale and immune to the drift incremental updates accumulate. Rows are
merged (merged_into), never deleted, and reminders always follow the
surviving row.
"""

from collections import Counter, defaultdict
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from . import normalize as nz
from .models import Medication, MedicationMatchDecision, MedicationOccurrence, ReminderSchedule, DoseLog

CONFLICT_WINDOW_DAYS = 2
SIMILAR_NAME_THRESHOLD = 0.85

Status = Medication.Status


# -- formatting ------------------------------------------------------------

def _day(value):
    return f'{value.day} {value:%b %Y}' if value else 'an unknown date'


def _doctor(name):
    name = (name or '').strip()
    if not name:
        return 'an unnamed doctor'
    return name if name.lower().startswith('dr') else f'Dr {name}'


def _clean(value, limit):
    if isinstance(value, (list, tuple)):
        value = ' + '.join(str(v) for v in value if v)
    return str(value).strip()[:limit] if value else ''


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def _parse_iso_date(value):
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


# -- occurrences -----------------------------------------------------------

def document_event_date(document):
    data = document.structured_data if isinstance(document.structured_data, dict) else {}
    return (
        document.document_date
        or _parse_iso_date(data.get('date'))
        or timezone.localdate(document.uploaded_at or timezone.now())
    )


def replace_document_occurrences(document):
    """
    Recreates this document's prescription lines from its structured_data.
    Occurrences are projections with nothing hanging off them, so replacing
    them is always safe — and it is what stops a corrected or re-processed
    document from leaving its old medicine names behind. A document that is
    a copy of another contributes nothing. Returns the number of lines.
    """
    MedicationOccurrence.objects.filter(source_document=document).delete()
    if document.duplicate_of_id:
        return 0

    data = document.structured_data if isinstance(document.structured_data, dict) else {}
    prescribed_on = document_event_date(document)
    doctor = _clean(document.doctor_name or data.get('doctor_name'), 150)
    hospital = _clean(document.hospital_name or data.get('hospital_name'), 150)

    rows = []
    for index, medicine in enumerate(_as_list(data.get('medicines'))):
        if isinstance(medicine, str):
            medicine = {'name': medicine}
        if not isinstance(medicine, dict):
            continue
        name = _clean(medicine.get('name'), 255)
        if not name:
            continue
        action = _clean(medicine.get('action'), 20).lower().replace(' ', '_')
        rows.append(MedicationOccurrence(
            profile_id=document.profile_id,
            source_document=document,
            line_index=index,
            name=name,
            generic_name=_clean(medicine.get('generic_name'), 255),
            brand_name=_clean(medicine.get('brand_name'), 150),
            strength=_clean(medicine.get('strength'), 100),
            form=_clean(medicine.get('form'), 50),
            route=_clean(medicine.get('route'), 30),
            release=_clean(medicine.get('release'), 30),
            dosage=_clean(medicine.get('dosage'), 100),
            frequency=_clean(medicine.get('frequency'), 100),
            instructions=_clean(medicine.get('instructions'), 255),
            duration=_clean(medicine.get('duration'), 100),
            action=action if action in nz.ACTIONS else '',
            action_text=_clean(medicine.get('action_text'), 255),
            prescribed_on=prescribed_on,
            doctor_name=doctor,
            hospital_name=hospital,
        ))
    MedicationOccurrence.objects.bulk_create(rows)
    return len(rows)


def identify_occurrence(occurrence):
    return nz.identify(
        occurrence.name, occurrence.dosage,
        generic_name=occurrence.generic_name, brand_name=occurrence.brand_name,
        form=occurrence.form, route=occurrence.route, release=occurrence.release,
    )


def effective_action(occurrence):
    return nz.classify_action(
        occurrence.instructions, occurrence.frequency, occurrence.duration, hinted=occurrence.action
    )


def _regimen(occurrence, identity):
    return identity.strength_sig, nz.frequency_signature(occurrence.frequency)


def _describe(occurrence, identity):
    parts = [identity.strength_display or occurrence.dosage, occurrence.frequency]
    text = ', '.join(p for p in parts if p)
    return text or occurrence.name


def _compatible(a, b):
    (strength_a, freq_a), (strength_b, freq_b) = a, b
    return ((not strength_a or not strength_b or strength_a == strength_b)
            and (not freq_a or not freq_b or freq_a == freq_b))


def _conflict(first, second):
    """Two sets of lines disagree when a line in either has no compatible line in the other."""
    return (any(not any(_compatible(a, b) for b in second) for a in first)
            or any(not any(_compatible(b, a) for a in first) for b in second))


# -- history ---------------------------------------------------------------

def history_entries(occurrences):
    """
    A medicine's prescription history, newest first. Identical lines from
    the same date and doctor collapse into one entry listing every document
    they appear in — two copies of one prescription are one event.
    """
    entries = {}
    ordered = sorted(
        occurrences,
        key=lambda o: (o.prescribed_on or date.min, o.created_at, o.line_index),
    )
    for occurrence in ordered:
        identity = identify_occurrence(occurrence)
        key = (
            occurrence.prescribed_on,
            nz.doctor_signature(occurrence.doctor_name),
            identity.strength_sig,
            nz.frequency_signature(occurrence.frequency),
            nz.instruction_signature(occurrence.instructions),
            occurrence.source_deleted,
        )
        entry = entries.get(key)
        if entry is None:
            entry = entries[key] = {
                'date': nz.iso(occurrence.prescribed_on),
                'doctor_name': occurrence.doctor_name,
                'hospital_name': occurrence.hospital_name,
                'name': occurrence.name,
                'strength': identity.strength_display,
                'dosage': occurrence.dosage,
                'frequency': occurrence.frequency,
                'instructions': occurrence.instructions,
                'duration': occurrence.duration,
                'action': effective_action(occurrence),
                'action_text': occurrence.action_text,
                'end_date': nz.iso(occurrence.end_date),
                'source_deleted': occurrence.source_deleted,
                'documents': [],
            }
        document = occurrence.source_document
        if document is not None and all(d['id'] != str(document.id) for d in entry['documents']):
            entry['documents'].append({'id': str(document.id), 'title': document.title})
    return list(reversed(entries.values()))


# -- status ----------------------------------------------------------------

def derive_status(occurrences, identities, today):
    """
    Status fields for a medicine from its usable prescription lines (not
    from deleted documents), or None when there are none.
    """
    usable = sorted(
        (o for o in occurrences if not o.source_deleted and o.prescribed_on),
        key=lambda o: (o.prescribed_on, o.created_at, o.line_index),
    )
    if not usable:
        return None

    dates = sorted({o.prescribed_on for o in usable})
    latest_date = dates[-1]
    by_date = defaultdict(list)
    for o in usable:
        by_date[o.prescribed_on].append(o)
    latest = by_date[latest_date]
    actions = {o.id: effective_action(o) for o in usable}
    ends = {o.id: nz.course_end_date(o.prescribed_on, o.duration, o.instructions) for o in usable}
    latest_actions = [actions[o.id] for o in latest]

    window_start = latest_date - timedelta(days=CONFLICT_WINDOW_DAYS)
    window = [o for o in usable if o.prescribed_on >= window_start]
    by_document = defaultdict(list)
    for o in window:
        by_document[o.source_document_id].append(o)

    def regimens(lines):
        return [_regimen(o, identities[o.id]) for o in lines]

    def per_document_summary():
        parts = []
        for lines in by_document.values():
            first = lines[0]
            described = ' and '.join(
                'stop' if actions[o.id] == nz.ACTION_STOP else _describe(o, identities[o.id]) for o in lines
            )
            part = f'{_doctor(first.doctor_name)} on {_day(first.prescribed_on)}: {described}'
            if part not in parts:  # two copies of one prescription say it once
                parts.append(part)
        return '; '.join(parts)

    # Lines whose course has not run out describe what is current now.
    current_lines = [o for o in latest if not ends[o.id] or ends[o.id] >= today] or latest
    current = current_lines[-1]
    result = {
        'current': current,
        'first_prescribed_on': dates[0],
        'last_prescribed_on': latest_date,
        'last_prescribed_by': current.doctor_name,
        'prescription_count': len(dates),
        'status_date': latest_date,
        'end_date': None,
    }

    if latest_actions and all(a == nz.ACTION_STOP for a in latest_actions):
        quote = current.action_text or current.instructions
        result.update(
            status=Status.DISCONTINUED, end_date=latest_date,
            reason=f'Stopped on {_day(latest_date)} by {_doctor(current.doctor_name)}'
                   + (f': “{quote}”' if quote else '') + '.',
        )
        return result

    stops_in_window = any(actions[o.id] == nz.ACTION_STOP for o in window)
    document_conflict = len(by_document) > 1 and any(
        _conflict(regimens(a), regimens(b))
        for i, a in enumerate(by_document.values())
        for b in list(by_document.values())[i + 1:]
    )
    if stops_in_window or document_conflict:
        result.update(
            status=Status.NEEDS_REVIEW,
            reason=f'Prescriptions from the same few days disagree — {per_document_summary()}. '
                   f'Please check with your doctor which one is current.',
        )
        return result

    if latest_actions and all(a == nz.ACTION_ONE_TIME for a in latest_actions):
        result.update(
            status=Status.ONE_TIME, end_date=latest_date,
            reason=f'One-time dose on {_day(latest_date)} ({_doctor(current.doctor_name)}).',
        )
        return result

    latest_ends = [ends[o.id] for o in latest]
    if all(latest_ends) and max(latest_ends) < today:
        course = current.duration or 'The'
        result.update(
            status=Status.COMPLETED, end_date=max(latest_ends),
            reason=f'{course} course prescribed on {_day(latest_date)} by {_doctor(current.doctor_name)} '
                   f'ended around {_day(max(latest_ends))}.',
        )
        return result

    # Still current: started, continued or modified.
    change_note = ''
    last_change = None
    for previous_date, next_date in zip(dates, dates[1:]):
        if _conflict(regimens(by_date[previous_date]), regimens(by_date[next_date])):
            last_change = (previous_date, next_date)
    if last_change and last_change[1] == latest_date:
        before = by_date[last_change[0]][-1]
        result.update(
            status=Status.MODIFIED,
            reason=f'Changed on {_day(latest_date)} by {_doctor(current.doctor_name)}: '
                   f'{_describe(before, identities[before.id])} → {_describe(current, identities[current.id])}.',
        )
    else:
        if last_change:
            before = by_date[last_change[0]][-1]
            after = by_date[last_change[1]][-1]
            change_note = (
                f' Dose changed from {_describe(before, identities[before.id])} to '
                f'{_describe(after, identities[after.id])} on {_day(last_change[1])} '
                f'({_doctor(after.doctor_name)}).'
            )
        if len(dates) > 1 or nz.ACTION_CONTINUE in latest_actions:
            since = f', on {len(dates)} prescriptions since {_day(dates[0])}' if len(dates) > 1 else ''
            result.update(
                status=Status.CONTINUED,
                reason=f'Continued — last prescribed on {_day(latest_date)} by '
                       f'{_doctor(current.doctor_name)}{since}.{change_note}',
            )
        else:
            result.update(
                status=Status.ACTIVE,
                reason=f'Prescribed on {_day(latest_date)} by {_doctor(current.doctor_name)}.',
            )

    running_ends = [ends[o.id] for o in current_lines]
    if all(running_ends):
        result['reason'] += f' Course runs until about {_day(max(running_ends))}.'
    held = [o for o in latest if actions[o.id] == nz.ACTION_HOLD]
    if held:
        quote = held[-1].action_text or held[-1].instructions
        result['reason'] += f' Note from the prescription: “{quote}”.'
    return result


# -- rebuild ---------------------------------------------------------------

def _visit(occurrence):
    """One prescription: a date and a doctor."""
    return occurrence.prescribed_on, nz.doctor_signature(occurrence.doctor_name)


def _resolve(key, aliases):
    seen = set()
    while key in aliases and key not in seen:
        seen.add(key)
        key = aliases[key]
    return key


def _merge_into(row, survivor, today):
    """Folds `row` into `survivor`: reminders and earlier merges follow it."""
    ReminderSchedule.objects.filter(medication=row).update(medication=survivor)
    Medication.objects.filter(merged_into=row).update(merged_into=survivor)
    MedicationOccurrence.objects.filter(medication=row).update(medication=survivor)
    row.merged_into = survivor
    row.is_active = False
    row.status_computed_on = today
    row.save(update_fields=['merged_into', 'is_active', 'status_computed_on'])


def _dedupe_reminders(medication):
    """Two reminders at the same time on a merged medicine would fire twice."""
    seen = {}
    for reminder in ReminderSchedule.objects.filter(medication=medication).order_by('time_of_day', 'id'):
        key = (reminder.time_of_day, reminder.days_of_week)
        if key in seen:
            DoseLog.objects.filter(reminder=reminder).update(reminder=seen[key])
            reminder.delete()
        else:
            seen[key] = reminder


def _ensure_document_occurrences(profile):
    """Documents processed before occurrences existed get theirs now."""
    from documents.models import Document

    missing = (
        Document.objects.filter(profile=profile, duplicate_of__isnull=True)
        .annotate(lines=Count('medication_occurrences'))
        .filter(lines=0)
    )
    for document in missing:
        data = document.structured_data if isinstance(document.structured_data, dict) else {}
        if _as_list(data.get('medicines')):
            replace_document_occurrences(document)


def _suggestions(visible, identities_by_med, different_pairs):
    """'Is this the same medicine?' prompts — never merged without the person."""
    found = defaultdict(list)
    for i, a in enumerate(visible):
        for b in visible[i + 1:]:
            if tuple(sorted((a.match_key, b.match_key))) in different_pairs:
                continue
            ia, ib = identities_by_med[a.id], identities_by_med[b.id]
            reason = ''
            if ia.ingredients and ia.ingredients == ib.ingredients and ia.route == ib.route and ia.release != ib.release:
                reason = 'Same active ingredients, but one is a modified-release (e.g. CR/SR) form'
            elif ia.route == ib.route and ia.release == ib.release:
                name_a = '+'.join(ia.ingredients) or a.match_key
                name_b = '+'.join(ib.ingredients) or b.match_key
                if name_a != name_b and nz.name_similarity(name_a, name_b) >= SIMILAR_NAME_THRESHOLD:
                    reason = 'Very similar spelling'
            if reason:
                found[a.id].append({'id': str(b.id), 'name': b.name, 'reason': reason})
                found[b.id].append({'id': str(a.id), 'name': a.name, 'reason': reason})
    return found


@transaction.atomic
def rebuild_profile_medications(profile, today=None):
    """
    Recomputes every medicine on this profile from its prescription lines.
    Idempotent. Returns the profile's visible (unmerged, unarchived)
    Medication rows.
    """
    from family.models import Profile

    today = today or timezone.localdate()
    # Serialises concurrent rebuilds of one profile (no-op on SQLite).
    Profile.objects.select_for_update().filter(pk=profile.pk).first()

    _ensure_document_occurrences(profile)

    decisions = list(MedicationMatchDecision.objects.filter(profile=profile))
    aliases = {d.key_from: d.key_to for d in decisions if d.decision == MedicationMatchDecision.Decision.SAME}
    different_pairs = {
        tuple(sorted((d.key_from, d.key_to)))
        for d in decisions if d.decision == MedicationMatchDecision.Decision.DIFFERENT
    }

    occurrences = list(
        MedicationOccurrence.objects.filter(profile=profile).select_related('source_document')
    )
    identities = {}
    for occurrence in occurrences:
        identity = identify_occurrence(occurrence)
        identities[occurrence.id] = identity
        occurrence.match_key = _resolve(identity.key, aliases)
        occurrence.end_date = nz.course_end_date(occurrence.prescribed_on, occurrence.duration, occurrence.instructions)

    medications = list(
        Medication.objects.filter(profile=profile, merged_into__isnull=True)
        .annotate(reminder_count=Count('reminders'))
    )
    attached = defaultdict(list)
    for occurrence in occurrences:
        if occurrence.medication_id:
            attached[occurrence.medication_id].append(occurrence)

    raw_keys = {}
    groups = defaultdict(list)
    for medication in medications:
        lines = attached.get(medication.id)
        if lines:
            raw = Counter(identities[o.id].key for o in lines).most_common(1)[0][0]
        else:
            raw = nz.identify(medication.name, medication.dosage).key
        raw_keys[medication.id] = raw
        medication.match_key = _resolve(raw, aliases)
        groups[medication.match_key].append(medication)

    survivors = {}
    for key, rows in groups.items():
        rows.sort(key=lambda m: (
            m.user_status == Medication.UserStatus.REMOVED,
            m.is_archived,
            -m.reminder_count,
            raw_keys[m.id] != key,                 # the row the person merged INTO
            m.origin != Medication.Origin.MANUAL,
            m.start_date or date.max,
            str(m.id),
        ))
        survivor = rows[0]
        survivors[key] = survivor
        for row in rows[1:]:
            _merge_into(row, survivor, today)
        if len(rows) > 1 and survivor.reminder_count:
            _dedupe_reminders(survivor)

    # Attach every line to its medicine, reviving or creating rows as needed.
    merged_pool = None
    for occurrence in occurrences:
        key = occurrence.match_key
        if key not in survivors:
            if merged_pool is None:
                merged_pool = defaultdict(list)
                for row in Medication.objects.filter(profile=profile, merged_into__isnull=False):
                    merged_pool[_resolve(nz.identify(row.name, row.dosage).key, aliases)].append(row)
            if merged_pool.get(key):
                revived = merged_pool[key].pop(0)
                revived.merged_into = None
                revived.reminder_count = 0
                survivors[key] = revived
            else:
                survivors[key] = Medication(
                    profile=profile, origin=Medication.Origin.PRESCRIPTION, match_key=key,
                    name=occurrence.name[:150],
                )
                survivors[key].reminder_count = 0
                survivors[key].save()
        occurrence.medication = survivors[key]
    MedicationOccurrence.objects.bulk_update(occurrences, ['medication', 'match_key', 'end_date'])

    lines_by_med = defaultdict(list)
    for occurrence in occurrences:
        lines_by_med[occurrence.medication_id].append(occurrence)

    # Prescriptions a medicine could have appeared on, identified by date
    # and doctor rather than by file, so two copies of one prescription
    # (not yet confirmed as duplicates) count once.
    prescription_dates = {}
    for occurrence in occurrences:
        if not occurrence.source_deleted and occurrence.prescribed_on:
            prescription_dates[_visit(occurrence)] = occurrence.prescribed_on

    identities_by_med = {}
    for key, medication in survivors.items():
        lines = lines_by_med.get(medication.id, [])
        _apply(medication, key, lines, identities, prescription_dates, today)
        if lines:
            current = medication._current_line
            identities_by_med[medication.id] = identities[current.id] if current else identify_occurrence(lines[-1])
        else:
            identities_by_med[medication.id] = nz.identify(medication.name, medication.dosage)

    visible = [m for m in survivors.values() if not m.is_archived]
    suggestions = _suggestions(visible, identities_by_med, different_pairs)
    for medication in survivors.values():
        medication.possible_duplicates = suggestions.get(medication.id, [])
        medication.save()
    return visible


def _apply(medication, key, lines, identities, prescription_dates, today):
    """Writes identity, summary and status onto one surviving Medication."""
    medication.match_key = key
    medication.status_computed_on = today
    medication._current_line = None
    derived = derive_status(lines, identities, today)

    if derived:
        current = derived['current']
        medication._current_line = current
        identity = identities[current.id]
        medication.name = current.name[:150]
        medication.dosage = current.dosage[:100]
        medication.frequency = current.frequency[:100]
        medication.instructions = current.instructions[:255]
        medication.source_document_id = current.source_document_id
        medication.generic_name = identity.generic_display[:255]
        medication.form, medication.route, medication.release = identity.form, identity.route, identity.release
        medication.start_date = derived['first_prescribed_on']
        medication.end_date = derived['end_date']
        medication.first_prescribed_on = derived['first_prescribed_on']
        medication.last_prescribed_on = derived['last_prescribed_on']
        medication.last_prescribed_by = (derived['last_prescribed_by'] or '')[:150]
        medication.prescription_count = derived['prescription_count']
        medication.status = derived['status']
        medication.status_reason = derived['reason'][:500]
        medication.status_date = derived['status_date']
        medication.is_archived = False
        medication.brand_names = sorted({
            identities[o.id].brand.title() for o in lines if identities[o.id].brand
        })
        if medication.origin != Medication.Origin.MANUAL:
            medication.origin = Medication.Origin.PRESCRIPTION
    elif lines:
        # Only history carried over from a deleted document.
        identity = identities[lines[-1].id]
        medication.generic_name = medication.generic_name or identity.generic_display[:255]
        medication.status = Status.ACTIVE if medication.is_active else Status.DISCONTINUED
        medication.status_reason = (
            'The prescription this came from was deleted from the locker. '
            'Remove it if you no longer take it.'
        )
        medication.prescription_count = 0
    else:
        if medication.origin == Medication.Origin.PRESCRIPTION and not medication.reminder_count:
            # Every prescription that named it has been deleted.
            medication.is_archived = True
            medication.is_active = False
            medication.status_reason = 'Its prescription was deleted from the locker.'
            medication.newer_prescriptions_without = 0
            return
        medication.status = Status.ACTIVE if medication.is_active else Status.DISCONTINUED
        medication.status_reason = (
            'Added by you.' if medication.origin == Medication.Origin.MANUAL
            else 'Its prescription was deleted; kept because it has reminders.'
        )
        medication.prescription_count = 0

    # The person's own word wins until a newer prescription arrives.
    confirmed_on = None
    if medication.user_status and medication.user_status_at:
        said_on = timezone.localdate(medication.user_status_at)
        newer = derived and derived['last_prescribed_on'] > said_on
        if not newer:
            if medication.user_status in (Medication.UserStatus.STOPPED, Medication.UserStatus.REMOVED):
                medication.status = Status.DISCONTINUED
                medication.status_reason = f'You marked this as stopped on {_day(said_on)}.'
                medication.status_date = said_on
                medication.end_date = said_on
                medication.is_archived = medication.user_status == Medication.UserStatus.REMOVED
            elif medication.user_status == Medication.UserStatus.TAKING:
                confirmed_on = said_on
                if medication.status not in Medication.CURRENT_STATUSES:
                    medication.status = Status.ACTIVE
                    medication.status_reason = f'You confirmed on {_day(said_on)} that you are still taking this.'
                    medication.status_date = said_on
                    medication.end_date = None

    medication.is_active = medication.status in Medication.CURRENT_STATUSES and not medication.is_archived

    newer_without = 0
    if derived and medication.is_active:
        since = max(filter(None, [derived['last_prescribed_on'], confirmed_on]))
        mine = {_visit(o) for o in lines}
        later = [d for visit, d in prescription_dates.items() if d > since and visit not in mine]
        newer_without = len(later)
        if newer_without:
            count = 'a newer prescription' if newer_without == 1 else f'{newer_without} newer prescriptions'
            medication.status_reason = (
                f'{medication.status_reason} Not listed on {count} (after '
                f'{_day(derived["last_prescribed_on"])}) — check whether you are still taking it.'
            )[:500]
    medication.newer_prescriptions_without = newer_without


def ensure_fresh(profile_ids):
    """
    Rebuilds any of these profiles whose medicines have not been computed
    today (status depends on today's date: a 5-day course ends) or that
    still hold lines from before consolidation existed.
    """
    from family.models import Profile

    today = timezone.localdate()
    profile_ids = list(profile_ids)
    if not profile_ids:
        return
    stale = set(
        MedicationOccurrence.objects.filter(profile_id__in=profile_ids, match_key='')
        .values_list('profile_id', flat=True)
    )
    stale |= set(
        Medication.objects.filter(profile_id__in=profile_ids, merged_into__isnull=True)
        .filter(Q(status_computed_on__isnull=True) | Q(status_computed_on__lt=today))
        .values_list('profile_id', flat=True)
    )
    for profile in Profile.objects.filter(pk__in=stale):
        rebuild_profile_medications(profile, today=today)
