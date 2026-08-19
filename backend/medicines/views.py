from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import DoseLog, Medication, ReminderSchedule
from .serializers import DoseLogSerializer, MedicationSerializer, ReminderScheduleSerializer


class MedicationViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Medication.objects.filter(profile__account=self.request.user)
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs


class ReminderScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ReminderScheduleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ReminderSchedule.objects.filter(medication__profile__account=self.request.user)


class DoseLogViewSet(viewsets.ModelViewSet):
    serializer_class = DoseLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = DoseLog.objects.filter(reminder__medication__profile__account=self.request.user)
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            qs = qs.filter(reminder__medication__profile_id=profile_id)
        return qs
