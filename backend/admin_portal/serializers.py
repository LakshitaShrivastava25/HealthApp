from rest_framework import serializers

from accounts.models import Account
from doctors.models import Doctor
from family.models import Profile
from documents.models import Document
from insurance.models import InsurancePolicy
from .models import AuditLog


class AdminDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ['id', 'profile', 'title', 'category', 'status', 'raw_ocr_text', 'structured_data', 'uploaded_at']
        read_only_fields = ['id', 'profile', 'title', 'category', 'raw_ocr_text', 'uploaded_at']


class AdminInsurancePolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = InsurancePolicy
        fields = ['id', 'profile', 'insurer', 'policy_number', 'status', 'raw_text', 'structured_data', 'uploaded_at']
        read_only_fields = ['id', 'profile', 'raw_text', 'uploaded_at']


class AdminDoctorVerificationSerializer(serializers.ModelSerializer):
    """
    Everything an admin needs to actually verify a doctor's credentials, not
    just enough to recognise the name. verification_status stays writable —
    the approve/reject workflow is unchanged; every other field is read-only,
    since this screen reviews a registration rather than edits it.
    """

    # The doctor's own OTP login number, from the linked Account. Exposed
    # under a distinctly different name from booking_phone_number on purpose:
    # one is private login context for the admin, the other is the number
    # patients will be shown. Conflating them in the UI would be a real
    # privacy problem, so they are never named alike.
    account_phone_number = serializers.CharField(source='account.phone_number', read_only=True)

    class Meta:
        model = Doctor
        fields = [
            'id', 'full_name', 'specialization', 'qualification', 'experience_years',
            'registration_number', 'clinic_name', 'clinic_address',
            'consultation_fee', 'booking_phone_number', 'account_phone_number',
            'available_days', 'clinic_open_time', 'clinic_close_time',
            'license_document', 'verification_status',
        ]
        read_only_fields = [
            'id', 'full_name', 'specialization', 'qualification', 'experience_years',
            'registration_number', 'clinic_name', 'clinic_address',
            'consultation_fee', 'booking_phone_number', 'account_phone_number',
            'available_days', 'clinic_open_time', 'clinic_close_time',
            'license_document',
        ]


class AdminPatientProfileSerializer(serializers.ModelSerializer):
    """
    A staff directory view of registered patient profiles — who exists and
    which login they sit under, nothing more.

    Deliberately NOT a medical record view: allergies, medications,
    documents and insurance are all reachable from Profile via related
    managers, and none of them belong in a directory listing. An admin who
    needs clinical data should go through the existing per-record review
    screens, which are individually audited.

    Read-only throughout: this endpoint exists to look, not to edit.
    """

    account_phone_number = serializers.CharField(source='account.phone_number', read_only=True)

    class Meta:
        model = Profile
        fields = ['id', 'full_name', 'relation', 'account', 'account_phone_number', 'created_at']
        read_only_fields = fields


class AdminAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'phone_number', 'email', 'role', 'is_active', 'date_joined']
        read_only_fields = ['id', 'phone_number', 'email', 'date_joined']


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ['id', 'staff', 'action', 'target_type', 'target_id', 'detail', 'created_at']
        read_only_fields = fields
