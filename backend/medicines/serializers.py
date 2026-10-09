from rest_framework import serializers

from .consolidation import history_entries
from .models import DoseLog, Medication, ReminderSchedule


class ReminderScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderSchedule
        fields = ['id', 'medication', 'time_of_day', 'days_of_week', 'is_active']


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
    history = serializers.SerializerMethodField()

    class Meta:
        model = Medication
        fields = [
            'id', 'profile', 'source_document', 'name', 'dosage', 'frequency',
            'instructions', 'start_date', 'end_date', 'is_active', 'reminders',
            *DERIVED_FIELDS, 'history',
        ]
        read_only_fields = DERIVED_FIELDS

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
