import secrets
import string
import uuid

from django.conf import settings
from django.db import models

REFERENCE_CODE_LETTERS = 2
REFERENCE_CODE_DIGITS = 4
REFERENCE_CODE_ATTEMPTS = 20


def generate_reference_code():
    """
    A short, sayable patient reference: two uppercase letters then four
    digits, e.g. "AB1234". 26^2 * 10^4 = 6,760,000 combinations.

    Retries on collision rather than trusting the odds. The loop is bounded:
    an unbounded one would spin forever if the space ever filled up, and a
    loud failure is better than a hung request. `secrets` rather than
    `random` to match generate_public_token() in emergency/models.py — this
    is a shared identifier, so guessable sequences are worth avoiding even
    though the code alone grants nothing without the patient's approval.

    NOTE: this check is not a substitute for the DB unique constraint. Two
    concurrent creates could both pass it; the constraint is what actually
    guarantees uniqueness, and this loop is what stops that being a
    routine occurrence.
    """
    for _ in range(REFERENCE_CODE_ATTEMPTS):
        code = (
            ''.join(secrets.choice(string.ascii_uppercase) for _ in range(REFERENCE_CODE_LETTERS))
            + ''.join(secrets.choice(string.digits) for _ in range(REFERENCE_CODE_DIGITS))
        )
        if not Profile.objects.filter(reference_code=code).exists():
            return code
    raise RuntimeError(
        'Could not generate a unique patient reference code after '
        f'{REFERENCE_CODE_ATTEMPTS} attempts.'
    )


class Profile(models.Model):
    """
    A family member under one Account. 'Self' is auto-created when an
    Account first completes profile setup. Every medical/insurance record
    elsewhere in the system is scoped to a profile_id, not the account —
    this is what lets one login manage dependents' records separately.
    """

    class Relation(models.TextChoices):
        SELF = 'self', 'Self'
        FATHER = 'father', 'Father'
        MOTHER = 'mother', 'Mother'
        SPOUSE = 'spouse', 'Spouse'
        SON = 'son', 'Son'
        DAUGHTER = 'daughter', 'Daughter'
        OTHER = 'other', 'Other'

    class Gender(models.TextChoices):
        MALE = 'male', 'Male'
        FEMALE = 'female', 'Female'
        OTHER = 'other', 'Other'
        PREFER_NOT_TO_SAY = 'prefer_not_to_say', 'Prefer not to say'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profiles')
    full_name = models.CharField(max_length=150)
    relation = models.CharField(max_length=20, choices=Relation.choices, default=Relation.SELF)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, choices=Gender.choices, blank=True)
    blood_group = models.CharField(max_length=5, blank=True)
    height_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    weight_kg = models.PositiveSmallIntegerField(null=True, blank=True)
    preferred_language = models.CharField(max_length=30, default='English')
    # The short code a patient reads out so a doctor can request access.
    # Additional to `id`, never a replacement: every internal relationship in
    # the app still points at the UUID primary key above.
    reference_code = models.CharField(
        max_length=6, unique=True, blank=True, default=generate_reference_code
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-relation']

    def save(self, *args, **kwargs):
        # The callable default covers normal creation, but a caller that
        # explicitly passes reference_code='' would slip past it — and with
        # unique=True the SECOND such row would then crash on a blank
        # collision. This makes an empty value impossible either way.
        if not self.reference_code:
            self.reference_code = generate_reference_code()
        self.reference_code = self.reference_code.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} ({self.relation})"


class AllergyRecord(models.Model):
    """
    Drug/food/environmental allergy or adverse-reaction memory, scoped per
    profile. Surfaced contextually elsewhere (e.g. prescription review) —
    never used to independently declare a medicine unsafe (see TDD §8.8).
    """

    class Kind(models.TextChoices):
        DRUG = 'drug', 'Drug'
        FOOD = 'food', 'Food'
        ENVIRONMENTAL = 'environmental', 'Environmental'
        OTHER = 'other', 'Other'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='allergies')
    kind = models.CharField(max_length=20, choices=Kind.choices)
    substance = models.CharField(max_length=150)
    reaction = models.CharField(max_length=255, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.substance} — {self.profile.full_name}"


class Notification(models.Model):
    """
    A generated, user-facing alert — currently premium renewals and
    medicine reminders, produced by the `generate_reminders` management
    command rather than written by hand anywhere in the app.

    related_id holds the id of the InsurancePolicy or Medication the
    notification is about. It is deliberately a plain UUID rather than a
    real FK: the two sources live in different apps, and a generic
    relation would buy nothing here beyond the idempotency lookup it
    exists to serve (see the command's dedupe logic).
    """

    class Type(models.TextChoices):
        PREMIUM_DUE = 'premium_due', 'Premium Due'
        MEDICINE_REMINDER = 'medicine_reminder', 'Medicine Reminder'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=30, choices=Type.choices)
    title = models.CharField(max_length=200)
    message = models.TextField()
    related_id = models.UUIDField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # The exact lookup the idempotency check runs on every pass.
            models.Index(fields=['profile', 'notification_type', 'related_id', 'created_at']),
        ]

    def __str__(self):
        return f"{self.get_notification_type_display()} — {self.profile.full_name}"
