from django.conf import settings
from rest_framework import serializers

from accounts.models import Account
from doctors.councils import council_name
from doctors.models import Doctor
from family.models import Profile
from documents.models import Document
from documents.validators import FileKindField
from insurance.models import InsurancePolicy
from .models import AuditLog


class AdminDocumentSerializer(serializers.ModelSerializer):
    # The source file, so a reviewer can compare what was read against it.
    file_type = FileKindField(source='file')

    class Meta:
        model = Document
        fields = ['id', 'profile', 'title', 'category', 'status', 'raw_ocr_text', 'structured_data', 'uploaded_at',
                  'file', 'file_type']
        read_only_fields = ['id', 'profile', 'title', 'category', 'raw_ocr_text', 'uploaded_at', 'file']


class AdminInsurancePolicySerializer(serializers.ModelSerializer):
    file_type = FileKindField(source='file')

    class Meta:
        model = InsurancePolicy
        fields = ['id', 'profile', 'insurer', 'policy_number', 'status', 'raw_text', 'structured_data', 'uploaded_at',
                  'file', 'file_type']
        read_only_fields = ['id', 'profile', 'raw_text', 'uploaded_at', 'file']


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
    state_council_name = serializers.SerializerMethodField()
    verified_by_phone = serializers.CharField(source='verified_by.phone_number', read_only=True, default=None)
    name_matches = serializers.SerializerMethodField()
    # Where the admin can check the register by hand.
    imr_url = serializers.SerializerMethodField()
    license_document_type = FileKindField(source='license_document')

    class Meta:
        model = Doctor
        fields = [
            'id', 'full_name', 'specialization', 'qualification', 'experience_years',
            'registration_number', 'state_council_id', 'state_council_name', 'registration_year',
            'clinic_name', 'clinic_address',
            'consultation_fee', 'booking_phone_number', 'account_phone_number',
            'available_days', 'clinic_open_time', 'clinic_close_time',
            'license_document', 'license_document_type', 'verification_status', 'submitted_at',
            # What the NMC register said — the admin's evidence.
            'nmc_result', 'nmc_checked_at', 'nmc_doctor_id', 'nmc_name', 'nmc_qualification',
            'nmc_university', 'nmc_registration_date', 'nmc_suspended', 'nmc_remarks',
            'nmc_payload', 'name_match_score', 'name_matches', 'verification_provider',
            'verification_attempts', 'last_verification_error', 'provider_attempts', 'verification_consent_at',
            # The admin's decision.
            'verified_at', 'verified_by_phone', 'rejection_reason', 'imr_url',
        ]
        # Everything is read-only here: status changes go through the
        # audited approve / reject / reverify actions, never a bare PATCH.
        read_only_fields = fields

    def get_state_council_name(self, obj):
        return council_name(obj.state_council_id) or None

    def get_name_matches(self, obj):
        if obj.name_match_score is None:
            return None
        return obj.name_match_score >= settings.DOCTOR_NAME_MATCH_THRESHOLD

    def get_imr_url(self, obj):
        return 'https://nmc.org.in/information-desk/indian-medical-register/'


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
