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
