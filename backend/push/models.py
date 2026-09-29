import uuid

from django.conf import settings
from django.db import models


class PushDevice(models.Model):
    """
    One phone that can receive push notifications for an account.

    The token is an Expo push token ("ExponentPushToken[...]"). Expo routes
    it to FCM or APNs, so the backend never holds Firebase or Apple keys.
    A token belongs to whichever account last registered it: when someone
    logs out and a family member logs in on the same phone, the row moves
    rather than leaving the first person's alerts arriving on it.
    """

    class Platform(models.TextChoices):
        ANDROID = 'android', 'Android'
        IOS = 'ios', 'iOS'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='push_devices')
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, choices=Platform.choices, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.platform or 'device'} — {self.account}"
