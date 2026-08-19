from django.contrib import admin
from .models import ConsultationNote, Doctor, DoctorPatientAccess

admin.site.register(Doctor)
admin.site.register(DoctorPatientAccess)
admin.site.register(ConsultationNote)
