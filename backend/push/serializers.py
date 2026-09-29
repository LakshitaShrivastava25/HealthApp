from rest_framework import serializers

from .models import PushDevice


class PushDeviceSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255)
    platform = serializers.ChoiceField(choices=PushDevice.Platform.choices, required=False, allow_blank=True)

    def validate_token(self, value):
        if not (value.startswith('ExponentPushToken[') or value.startswith('ExpoPushToken[')):
            raise serializers.ValidationError('Not an Expo push token.')
        return value
