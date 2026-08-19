import uuid

from django.conf import settings
from django.db import models


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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profiles')
    full_name = models.CharField(max_length=150)
    relation = models.CharField(max_length=20, choices=Relation.choices, default=Relation.SELF)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    blood_group = models.CharField(max_length=5, blank=True)
    height_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    weight_kg = models.PositiveSmallIntegerField(null=True, blank=True)
    preferred_language = models.CharField(max_length=30, default='English')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-relation']

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
