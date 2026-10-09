import uuid

from django.db import models
from django.utils import timezone

from documents.models import Document
from family.models import Profile


class Medication(models.Model):
    """
    One medicine on a profile's list — consolidated across every
    prescription that mentions it (see consolidation.py).

    Each prescription line is a MedicationOccurrence; this row is the single
    record the apps list, that reminders hang off, and whose status says
    whether the person is still meant to be taking it. The plain columns
    (name, dosage, frequency, instructions, is_active) are kept filled from
    the latest prescription so older app builds keep working unchanged.
    """

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        CONTINUED = 'continued', 'Continued'
        MODIFIED = 'modified', 'Modified'
        NEEDS_REVIEW = 'needs_review', 'Needs review'
        DISCONTINUED = 'discontinued', 'Discontinued'
        COMPLETED = 'completed', 'Course completed'
        ONE_TIME = 'one_time', 'One-time'

    CURRENT_STATUSES = (Status.ACTIVE, Status.CONTINUED, Status.MODIFIED, Status.NEEDS_REVIEW)

    class Origin(models.TextChoices):
        PRESCRIPTION = 'prescription', 'From a prescription'
        MANUAL = 'manual', 'Added by hand'

    class UserStatus(models.TextChoices):
        TAKING = 'taking', 'Still taking'
        STOPPED = 'stopped', 'Stopped'
        REMOVED = 'removed', 'Removed from list'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='medications')
    # The latest prescription this medicine appears on.
    source_document = models.ForeignKey(Document, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=150)
    dosage = models.CharField(max_length=100, blank=True)
    frequency = models.CharField(max_length=100, blank=True)
    instructions = models.CharField(max_length=255, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    # Identity (medicines/normalize.py).
    match_key = models.CharField(max_length=255, blank=True, db_index=True)
    generic_name = models.CharField(max_length=255, blank=True)
    brand_names = models.JSONField(default=list, blank=True)
    form = models.CharField(max_length=30, blank=True)
    route = models.CharField(max_length=20, blank=True)
    release = models.CharField(max_length=10, blank=True)

    # Status, derived from the prescriptions' explicit instructions.
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    status_reason = models.CharField(max_length=500, blank=True)
    status_date = models.DateField(null=True, blank=True)
    status_computed_on = models.DateField(null=True, blank=True)
    first_prescribed_on = models.DateField(null=True, blank=True)
    last_prescribed_on = models.DateField(null=True, blank=True)
    last_prescribed_by = models.CharField(max_length=150, blank=True)
    prescription_count = models.PositiveSmallIntegerField(default=0)
    # Later prescriptions that do NOT list this medicine. Shown as a question
    # to the person, never used to mark the medicine as discontinued.
    newer_prescriptions_without = models.PositiveSmallIntegerField(default=0)
    possible_duplicates = models.JSONField(default=list, blank=True)

    origin = models.CharField(max_length=20, choices=Origin.choices, default=Origin.MANUAL)
    # The person's own word, which wins until a newer prescription arrives.
    user_status = models.CharField(max_length=20, choices=UserStatus.choices, blank=True)
    user_status_at = models.DateTimeField(null=True, blank=True)
    # Rows folded into another during consolidation are kept, not deleted,
    # so the merge stays traceable and nothing a person built is lost.
    merged_into = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='merged_rows'
    )
    # A prescription medicine whose every source document was deleted.
    is_archived = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class MedicationOccurrence(models.Model):
    """
    One medicine line on one prescription: what that doctor wrote on that
    date. Rebuilt from Document.structured_data whenever the document is
    processed, corrected or deleted, so a misread name fixed on the review
    screen never leaves the old reading behind.
    """

    class Action(models.TextChoices):
        START = 'start', 'Started'
        CONTINUE = 'continue', 'Continued'
        CHANGE = 'change', 'Changed'
        STOP = 'stop', 'Stopped'
        HOLD = 'hold', 'Temporarily withheld'
        ONE_TIME = 'one_time', 'One-time dose'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='medication_occurrences')
    medication = models.ForeignKey(
        Medication, on_delete=models.SET_NULL, null=True, blank=True, related_name='occurrences'
    )
    source_document = models.ForeignKey(
        Document, on_delete=models.CASCADE, null=True, blank=True, related_name='medication_occurrences'
    )
    # History carried over from a medicine row whose document was deleted
    # before occurrences existed. Shown in the history, never used for status.
    source_deleted = models.BooleanField(default=False)
    line_index = models.PositiveSmallIntegerField(default=0)

    name = models.CharField(max_length=255)
    generic_name = models.CharField(max_length=255, blank=True)
    brand_name = models.CharField(max_length=150, blank=True)
    strength = models.CharField(max_length=100, blank=True)
    form = models.CharField(max_length=50, blank=True)
    route = models.CharField(max_length=30, blank=True)
    release = models.CharField(max_length=30, blank=True)

    dosage = models.CharField(max_length=100, blank=True)
    frequency = models.CharField(max_length=100, blank=True)
    instructions = models.CharField(max_length=255, blank=True)
    duration = models.CharField(max_length=100, blank=True)
    # As stated by the extraction; '' when the document said nothing explicit.
    action = models.CharField(max_length=20, choices=Action.choices, blank=True)
    action_text = models.CharField(max_length=255, blank=True)

    prescribed_on = models.DateField(null=True, blank=True)
    doctor_name = models.CharField(max_length=150, blank=True)
    hospital_name = models.CharField(max_length=150, blank=True)
    end_date = models.DateField(null=True, blank=True)
    match_key = models.CharField(max_length=255, blank=True, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['prescribed_on', 'line_index']

    def __str__(self):
        return f'{self.prescribed_on} — {self.name}'


class MedicationMatchDecision(models.Model):
    """
    The person's answer to "are these the same medicine?". 'same' maps
    key_from onto key_to on every rebuild; 'different' (stored with the keys
    sorted) stops that pair being suggested again.
    """

    class Decision(models.TextChoices):
        SAME = 'same', 'Same medicine'
        DIFFERENT = 'different', 'Different medicines'

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='medication_match_decisions')
    key_from = models.CharField(max_length=255)
    key_to = models.CharField(max_length=255)
    decision = models.CharField(max_length=10, choices=Decision.choices)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['profile', 'key_from', 'key_to'], name='unique_medication_match_decision'),
        ]


class ReminderSchedule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name='reminders')
    time_of_day = models.TimeField()
    days_of_week = models.CharField(max_length=20, default='daily')  # 'daily' or e.g. 'mon,thu'
    is_active = models.BooleanField(default=True)


class DoseLog(models.Model):
    class Status(models.TextChoices):
        TAKEN = 'taken', 'Taken'
        SKIPPED = 'skipped', 'Skipped'
        SNOOZED = 'snoozed', 'Snoozed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reminder = models.ForeignKey(ReminderSchedule, on_delete=models.CASCADE, related_name='logs')
    scheduled_for = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices)
    logged_at = models.DateTimeField(auto_now_add=True)
