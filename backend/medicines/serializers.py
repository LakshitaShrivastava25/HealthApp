from rest_framework import serializers

from .consolidation import history_entries
from .models import DoseLog, Medication, ReminderSchedule


class ReminderScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderSchedule
        fields = ['id', 'medication', 'time_of_day', 'days_of_week', 'is_active']


# Six doses a day is already an unusual routine, and the picker on the web
# app stops offering more at the same point.
MAX_REMINDER_TIMES = 6


def apply_reminder_times(medication, times):
    """
    Make this medicine's active reminder times exactly `times`.

    Times that are already set are left as they are, so their dose logs and
    any days_of_week survive a re-save. Times no longer wanted are switched
    off rather than deleted — the same thing removing a medicine does, and it
    keeps the dose history that points at them. Two rows holding the same time
    collapse to one, so a list that was edited repeatedly cannot end up
    reminding twice at once.
    """
    wanted = set(times)
    kept = set()
    for reminder in medication.reminders.all():
        if reminder.time_of_day in wanted and reminder.time_of_day not in kept:
            kept.add(reminder.time_of_day)
            if not reminder.is_active:
                reminder.is_active = True
                reminder.save(update_fields=['is_active'])
        elif reminder.is_active:
            reminder.is_active = False
            reminder.save(update_fields=['is_active'])

    ReminderSchedule.objects.bulk_create(
        [ReminderSchedule(medication=medication, time_of_day=t) for t in sorted(wanted - kept)]
    )


# Worked out from the prescriptions (medicines/consolidation.py) — never
# written by a client directly.
DERIVED_FIELDS = [
    'generic_name', 'brand_names', 'form', 'route', 'release',
    'status', 'status_reason', 'status_date',
    'first_prescribed_on', 'last_prescribed_on', 'last_prescribed_by',
    'prescription_count', 'newer_prescriptions_without', 'possible_duplicates',
    'origin', 'user_status', 'user_status_at',
]


class MedicationSerializer(serializers.ModelSerializer):
    reminders = ReminderScheduleSerializer(many=True, read_only=True)
    # Every time this medicine is taken, as one flat list, so a single request
    # can add a medicine together with all of its times. Reads the model
    # property; written through apply_reminder_times() in the viewset. Adding
    # it changes nothing that already worked: `reminders` is still returned in
    # full, POST /api/reminders/ still adds one time at a time, and leaving the
    # field out of a request leaves the existing times alone — so the mobile
    # app and older web builds carry on unchanged.
    reminder_times = serializers.ListField(
        child=serializers.TimeField(), required=False, max_length=MAX_REMINDER_TIMES
    )
    history = serializers.SerializerMethodField()

    class Meta:
        model = Medication
        fields = [
            'id', 'profile', 'source_document', 'name', 'dosage', 'frequency',
            'instructions', 'start_date', 'end_date', 'is_active', 'reminders',
            'reminder_times', *DERIVED_FIELDS, 'history',
        ]
        read_only_fields = DERIVED_FIELDS

    def validate_reminder_times(self, times):
        # The order they were typed in, and any repeat, are artefacts of how
        # the form was filled in rather than anything to store.
        return sorted(set(times))

    def get_history(self, medication):
        """Every prescription that mentions this medicine, newest first."""
        return history_entries(medication.occurrences.all())


class DoctorMedicationSerializer(serializers.ModelSerializer):
    """
    What an APPROVED doctor sees for a patient's medication — deliberately
    narrower than MedicationSerializer. Reminder schedules are excluded on
    purpose: time_of_day is the patient's own personal reminder routine,
    not clinically relevant to what a doctor needs to know about, which is
    the drug, the dose, how often, and how it's taken — and since when.
    """

    class Meta:
        model = Medication
        fields = [
            'id', 'profile', 'name', 'dosage', 'frequency', 'instructions',
            'generic_name', 'status', 'status_reason', 'first_prescribed_on',
            'last_prescribed_on', 'last_prescribed_by',
        ]
        read_only_fields = fields


class MedicationStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Medication.UserStatus.TAKING, Medication.UserStatus.STOPPED])


class MedicationPairSerializer(serializers.Serializer):
    other = serializers.UUIDField()


class DoseLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoseLog
        fields = ['id', 'reminder', 'scheduled_for', 'status', 'logged_at']
        read_only_fields = ['id', 'logged_at']
