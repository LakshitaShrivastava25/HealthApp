import uuid

from django.db import models

from documents.models import Document
from family.models import Profile


class Medication(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='medications')
    source_document = models.ForeignKey(Document, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=150)
    dosage = models.CharField(max_length=100, blank=True)
    frequency = models.CharField(max_length=100, blank=True)
    instructions = models.CharField(max_length=255, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class ReminderSchedule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name='reminders')
    time_of_day = models.TimeField()
    days_of_week = models.CharField(max_length=20, default='daily')  # 'daily' or e.g. 'mon,thu'
    is_active = models.BooleanField(default=True)


class DoseLog(models.Model):
    class Status(models.TextChoices):
        TAKEN = 'taken', 'Taken'
        SKIPPED = 'skipped', 'Skipped'
        SNOOZED = 'snoozed', 'Snoozed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reminder = models.ForeignKey(ReminderSchedule, on_delete=models.CASCADE, related_name='logs')
    scheduled_for = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices)
    logged_at = models.DateTimeField(auto_now_add=True)
