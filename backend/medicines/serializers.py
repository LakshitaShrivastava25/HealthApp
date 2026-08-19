from rest_framework import serializers

from .models import DoseLog, Medication, ReminderSchedule


class ReminderScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderSchedule
        fields = ['id', 'medication', 'time_of_day', 'days_of_week', 'is_active']


class MedicationSerializer(serializers.ModelSerializer):
    reminders = ReminderScheduleSerializer(many=True, read_only=True)

    class Meta:
        model = Medication
        fields = [
            'id', 'profile', 'source_document', 'name', 'dosage', 'frequency',
            'instructions', 'start_date', 'end_date', 'is_active', 'reminders',
        ]


class DoseLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoseLog
        fields = ['id', 'reminder', 'scheduled_for', 'status', 'logged_at']
        read_only_fields = ['id', 'logged_at']
