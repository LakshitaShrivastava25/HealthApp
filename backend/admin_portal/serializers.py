from rest_framework import serializers

from accounts.models import Account
from doctors.models import Doctor
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
    class Meta:
        model = Doctor
        fields = ['id', 'full_name', 'specialization', 'qualification', 'license_document', 'verification_status']
        read_only_fields = ['id', 'full_name', 'specialization', 'qualification', 'license_document']


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
