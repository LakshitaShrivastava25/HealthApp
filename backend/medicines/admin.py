from django.contrib import admin
from .models import DoseLog, Medication, MedicationMatchDecision, MedicationOccurrence, ReminderSchedule

admin.site.register(Medication)
admin.site.register(MedicationOccurrence)
admin.site.register(MedicationMatchDecision)
admin.site.register(ReminderSchedule)
admin.site.register(DoseLog)
