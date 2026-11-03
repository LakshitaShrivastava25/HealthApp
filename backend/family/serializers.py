from django.utils import timezone
from rest_framework import serializers

from .models import AllergyRecord, FamilyLinkRequest, Notification, Profile


class ProfileSerializer(serializers.ModelSerializer):
    initials = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            'id', 'full_name', 'relation', 'date_of_birth', 'gender',
            'blood_group', 'phone_number', 'phone_verified', 'height_cm', 'weight_kg',
            'preferred_language', 'reference_code', 'initials', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'reference_code', 'phone_verified']

    def validate_date_of_birth(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError('Date of birth cannot be in the future.')
        return value

    def validate(self, attrs):
        relation = attrs.get('relation', getattr(self.instance, 'relation', None))
        phone = attrs.get('phone_number', getattr(self.instance, 'phone_number', ''))
        is_child = relation in ('son', 'daughter')
        if not is_child and relation != 'self' and not phone:
            raise serializers.ValidationError(
                {'phone_number': 'Phone number is required for adult family members.'}
            )
        return attrs

    def get_initials(self, obj):
        parts = obj.full_name.split()
        return ''.join(p[0] for p in parts[:2]).upper()


class FamilyLinkRequestSerializer(serializers.ModelSerializer):
    from_account_phone = serializers.CharField(source='from_account.phone_number', read_only=True)
    from_profile_name = serializers.SerializerMethodField()

    class Meta:
        model = FamilyLinkRequest
        fields = [
            'id', 'from_account_phone', 'from_profile_name', 'to_phone',
            'relation', 'profile_data', 'status', 'created_at', 'responded_at',
        ]
        read_only_fields = fields

    def get_from_profile_name(self, obj):
        self_profile = obj.from_account.profiles.filter(relation='self').first()
        return self_profile.full_name if self_profile else obj.from_account.phone_number


class AllergyRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = AllergyRecord
        fields = ['id', 'profile', 'kind', 'substance', 'reaction', 'recorded_at']
        read_only_fields = ['id', 'recorded_at']


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'profile', 'notification_type', 'title', 'message',
            'related_id', 'is_read', 'created_at',
        ]
        read_only_fields = fields
