import re

from rest_framework import serializers

from .models import ConsultationNote, Doctor, DoctorPatientAccess


class DoctorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = [
            'id', 'full_name', 'specialization', 'qualification', 'experience_years',
            'license_document', 'verification_status', 'clinic_name', 'consultation_fee',
        ]
        read_only_fields = ['id', 'verification_status']

    def validate_full_name(self, value):
        """
        Every screen that shows a doctor's name prepends "Dr. " itself, so
        a stored name that already starts with "Dr." displays as
        "Dr. Dr. Priya Nair". The Doctor Portal's registration form strips
        this client-side, but that alone can be bypassed by any other
        caller (a direct API request, the Django admin, a future second
        client) — this is the durable enforcement point, applied
        regardless of source. Same regex as the frontend, verified there
        against "Drishti"/"Drake" not being corrupted (requires a real
        period or whitespace after "dr", not just zero-or-more spaces).
        """
        stripped = re.sub(r'^dr(\.\s*|\s+)', '', value, flags=re.IGNORECASE).strip()
        if not stripped:
            # DRF's blank check runs on the raw input BEFORE this method,
            # so "Dr." alone passes that check (it isn't blank) and would
            # otherwise silently save as an empty name after stripping —
            # this makes that a clear, real validation error instead.
            raise serializers.ValidationError("Enter a name, not just \"Dr.\"")
        return stripped


class DoctorPatientAccessSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorPatientAccess
        fields = ['id', 'doctor', 'profile', 'status', 'requested_at', 'responded_at', 'expires_at']
        read_only_fields = ['id', 'status', 'requested_at', 'responded_at']


class ConsultationNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsultationNote
        fields = ['id', 'doctor', 'profile', 'diagnosis', 'prescription', 'notes', 'follow_up_date', 'created_at']
        read_only_fields = ['id', 'doctor', 'created_at']
