from django.contrib import admin
from .models import DoseLog, Medication, ReminderSchedule

admin.site.register(Medication)
admin.site.register(ReminderSchedule)
admin.site.register(DoseLog)
