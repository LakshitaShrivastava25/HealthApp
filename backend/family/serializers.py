from django.utils import timezone
from rest_framework import serializers

from .models import AllergyRecord, Notification, Profile


class ProfileSerializer(serializers.ModelSerializer):
    initials = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            'id', 'full_name', 'relation', 'date_of_birth', 'gender',
            'blood_group', 'height_cm', 'weight_kg', 'preferred_language',
            'reference_code', 'initials', 'created_at',
        ]
        # reference_code is generated server-side and is the identifier a
        # patient shares — never something a client gets to choose.
        read_only_fields = ['id', 'created_at', 'reference_code']

    def validate_date_of_birth(self, value):
        """
        Nobody is born in the future. The signup and add-family-member forms
        both cap their date pickers at today, but a picker is a convenience,
        not a constraint — this is the rule.

        localdate(), not utcnow().date(): TIME_ZONE is Asia/Kolkata, and a
        UTC comparison would reject a birthday entered today before 05:30 IST.
        """
        if value and value > timezone.localdate():
            raise serializers.ValidationError('Date of birth cannot be in the future.')
        return value

    def get_initials(self, obj):
        parts = obj.full_name.split()
        return ''.join(p[0] for p in parts[:2]).upper()


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
