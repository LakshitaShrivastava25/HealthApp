from rest_framework import serializers

from .models import EmergencyProfile


class EmergencyProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyProfile
        fields = [
            'id', 'profile', 'public_token', 'revoked_at', 'is_active',
            'include_blood_group', 'include_allergies', 'include_conditions',
            'include_medications', 'include_emergency_contact', 'include_insurance_summary',
            'emergency_contact_name', 'emergency_contact_phone', 'created_at',
        ]
        read_only_fields = ['id', 'public_token', 'revoked_at', 'is_active', 'created_at']


class PublicEmergencyViewSerializer(serializers.Serializer):
    """Only the explicit allow-listed fields — this is what an unauthenticated scanner sees."""
    name = serializers.CharField()
    blood_group = serializers.CharField(required=False, allow_null=True)
    allergies = serializers.ListField(required=False)
    medications = serializers.ListField(required=False)
    emergency_contact_name = serializers.CharField(required=False, allow_null=True)
    emergency_contact_phone = serializers.CharField(required=False, allow_null=True)
