import uuid

from django.conf import settings
from django.db import models

from family.models import Profile


class ServiceProvider(models.Model):
    class ProviderType(models.TextChoices):
        BLOOD_BANK = 'blood_bank', 'Blood Bank'
        PATHOLOGY_LAB = 'pathology_lab', 'Pathology Lab'
        BOTH = 'both', 'Both'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    provider_type = models.CharField(max_length=20, choices=ProviderType.choices)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    contact_phone = models.CharField(max_length=15)
    contact_email = models.EmailField(blank=True)
    operating_hours = models.JSONField(default=dict, blank=True)
    service_area_pincodes = models.JSONField(default=list, blank=True)
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_provider_type_display()})"


class TestOffering(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey(ServiceProvider, on_delete=models.CASCADE, related_name='test_offerings')
    test_name = models.CharField(max_length=200)
    test_category = models.CharField(max_length=50, blank=True)
    price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    home_visit_available = models.BooleanField(default=False)
    turnaround_hours = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['test_name']

    def __str__(self):
        return f"{self.test_name} — {self.provider.name}"


class Booking(models.Model):
    class BookingType(models.TextChoices):
        WALK_IN = 'walk_in', 'Walk-in'
        HOME_VISIT = 'home_visit', 'Home Visit'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        CONFIRMED = 'confirmed', 'Confirmed'
        SAMPLE_COLLECTED = 'sample_collected', 'Sample Collected'
        REPORT_READY = 'report_ready', 'Report Ready'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='bookings')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='bookings')
    test_offering = models.ForeignKey(TestOffering, on_delete=models.CASCADE, related_name='bookings')
    booking_type = models.CharField(max_length=20, choices=BookingType.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    address = models.TextField(blank=True)
    preferred_time_slot = models.CharField(max_length=50, blank=True)
    provider_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.test_offering.test_name} — {self.profile.full_name} ({self.get_status_display()})"
