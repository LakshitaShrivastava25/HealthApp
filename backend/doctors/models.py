import re
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from family.models import Profile


class Doctor(models.Model):
    class VerificationStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        VERIFIED = 'verified', 'Verified'
        REJECTED = 'rejected', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='doctor_profile')
    full_name = models.CharField(max_length=150)
    specialization = models.CharField(max_length=150)
    qualification = models.CharField(max_length=255, blank=True)
    experience_years = models.PositiveSmallIntegerField(default=0)
    license_document = models.FileField(upload_to='doctor_licenses/', blank=True, null=True)
    verification_status = models.CharField(max_length=10, choices=VerificationStatus.choices, default=VerificationStatus.PENDING)
    clinic_name = models.CharField(max_length=150, blank=True)
    consultation_fee = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    # These three are required to REGISTER, but are blank=True here on
    # purpose. Doctors already on the platform predate them (the one
    # existing row also has a blank clinic_name), so a non-blank column
    # would break those rows and every Django-admin edit of them. The
    # "required" rule belongs to registration specifically and is enforced
    # in DoctorSerializer.validate(), not as a database constraint.
    # default='' keeps the migration non-interactive and backfills the
    # existing rows rather than leaving them NULL.
    registration_number = models.CharField(max_length=100, blank=True, default='')
    # A patient needs a real address to actually find the clinic, not just
    # which city it's in. 255 matches qualification/diagnosis in this file —
    # TextField here is reserved for genuinely unbounded prose (prescription,
    # notes), which a street address is not.
    clinic_address = models.CharField(max_length=255, blank=True, default='')
    # Deliberately NOT account.phone_number — that one is the doctor's
    # private OTP login. This is the number meant to be shown to patients
    # for booking, so the two must never be conflated.
    booking_phone_number = models.CharField(max_length=20, blank=True, default='')

    # Clinic availability — self-service, added by the doctor after
    # registration rather than required during it, so all three are
    # genuinely optional. A JSON list of day names rather than seven
    # booleans: the whole value is read and written as one unit by both the
    # Doctor Portal form and the patient-facing card, and seven columns
    # would make "which days" a seven-way join of trivia.
    available_days = models.JSONField(null=True, blank=True)
    clinic_open_time = models.TimeField(null=True, blank=True)
    clinic_close_time = models.TimeField(null=True, blank=True)

    def clean(self):
        # The real, universal enforcement point for the "Dr. Dr." fix.
        # DoctorSerializer.validate_full_name catches this for API callers,
        # but Django admin's ModelForm and any raw
        # Doctor.objects.create(...)/.save() call (seed_demo, a future
        # script) go straight through the ORM and never touch that
        # serializer — clean() is what Django admin calls automatically as
        # part of its own form validation, and save() below forces the
        # same check for every other path too.
        if self.full_name:
            stripped = re.sub(r'^dr(\.\s*|\s+)', '', self.full_name, flags=re.IGNORECASE).strip()
            if not stripped:
                raise ValidationError({'full_name': 'Enter a name, not just "Dr."'})
            self.full_name = stripped

    def save(self, *args, **kwargs):
        # Raw ORM calls don't run clean()/full_clean() automatically —
        # only Django admin's ModelForm does that on its own. This forces
        # the same validation for every other caller too.
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Dr. {self.full_name}"


class DoctorPatientAccess(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        DENIED = 'denied', 'Denied'
        REVOKED = 'revoked', 'Revoked'
        EXPIRED = 'expired', 'Expired'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='patient_access_grants')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='doctor_access_grants')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    requested_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ['doctor', 'profile']


class ConsultationNote(models.Model):
    """Doctor-authored content — clearly tagged, separate from patient-uploaded
    Documents or AI-generated summaries, per the TDD's data-provenance rule."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='notes')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='doctor_notes')
    diagnosis = models.CharField(max_length=255, blank=True)
    prescription = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
