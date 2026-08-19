import secrets
import uuid

from django.db import models

from family.models import Profile


def generate_public_token():
    return secrets.token_urlsafe(24)


class EmergencyProfile(models.Model):
    """
    Public token is what the QR encodes — NOT the data itself. The public
    endpoint (see views.py) returns only fields explicitly on the allow-list,
    never the full record, and can be revoked instantly.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.OneToOneField(Profile, on_delete=models.CASCADE, related_name='emergency_profile')
    public_token = models.CharField(max_length=64, unique=True, default=generate_public_token)
    revoked_at = models.DateTimeField(null=True, blank=True)

    include_blood_group = models.BooleanField(default=True)
    include_allergies = models.BooleanField(default=True)
    include_conditions = models.BooleanField(default=True)
    include_medications = models.BooleanField(default=True)
    include_emergency_contact = models.BooleanField(default=True)
    include_insurance_summary = models.BooleanField(default=False)

    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_active(self):
        return self.revoked_at is None
