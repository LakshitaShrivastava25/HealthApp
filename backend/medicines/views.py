from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from family.permissions import assert_owns_profile
from .models import DoseLog, Medication, ReminderSchedule
from .serializers import (
    DoctorMedicationSerializer,
    DoseLogSerializer,
    MedicationSerializer,
    ReminderScheduleSerializer,
)


class MedicationViewSet(viewsets.ModelViewSet):
    """
    /api/medications/ — a profile's medicines.

    A doctor with an APPROVED DoctorPatientAccess grant can also READ an
    approved patient's ACTIVE medications here, mirroring how
    AllergyRecordViewSet already grants doctors read access. Without this
    a doctor could see allergies, documents and timeline but never what
    the patient is currently taking — a real safety gap when reasoning
    about a new prescription. Doctors get the narrower
    DoctorMedicationSerializer (no personal reminder schedule) and can
    never create/update/delete a patient's medication.
    """
    serializer_class = MedicationSerializer
    permission_classes = [IsAuthenticated]

    def _is_doctor(self):
        return hasattr(self.request.user, 'doctor_profile')

    def get_serializer_class(self):
        if self._is_doctor():
            return DoctorMedicationSerializer
        return MedicationSerializer

    def get_queryset(self):
        user = self.request.user
        if self._is_doctor():
            from doctors.models import DoctorPatientAccess
            approved_profile_ids = DoctorPatientAccess.objects.filter(
                doctor=user.doctor_profile, status=DoctorPatientAccess.Status.APPROVED
            ).values_list('profile_id', flat=True)
            # Only what the patient is currently taking — a discontinued
            # medicine shown as current would be actively misleading.
            qs = Medication.objects.filter(profile_id__in=approved_profile_ids, is_active=True)
        else:
            qs = Medication.objects.filter(profile__account=user)
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        # Stable order so pagination cannot repeat or skip a medicine.
        return qs.order_by('name')

    def perform_create(self, serializer):
        if self._is_doctor():
            raise PermissionDenied("Doctors cannot add medications on behalf of a patient.")
        assert_owns_profile(self.request.user, serializer.validated_data.get('profile'))
        serializer.save()

    def perform_update(self, serializer):
        if self._is_doctor():
            raise PermissionDenied("Doctors cannot edit a patient's medications.")
        if 'profile' in serializer.validated_data:
            assert_owns_profile(self.request.user, serializer.validated_data['profile'])
        serializer.save()

    def perform_destroy(self, instance):
        if self._is_doctor():
            raise PermissionDenied("Doctors cannot delete a patient's medications.")
        instance.delete()


class ReminderScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ReminderScheduleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ReminderSchedule.objects.filter(medication__profile__account=self.request.user)

    def _assert_owns_medication(self, serializer):
        # A reminder reaches a profile one hop away, through the medication
        # it hangs off — so the ownership check has to follow that hop
        # rather than look for a 'profile' field that isn't on this model.
        medication = serializer.validated_data.get('medication')
        assert_owns_profile(self.request.user, getattr(medication, 'profile', None))

    def perform_create(self, serializer):
        self._assert_owns_medication(serializer)
        serializer.save()

    def perform_update(self, serializer):
        if 'medication' in serializer.validated_data:
            self._assert_owns_medication(serializer)
        serializer.save()


class DoseLogViewSet(viewsets.ModelViewSet):
    serializer_class = DoseLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = DoseLog.objects.filter(reminder__medication__profile__account=self.request.user)
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            qs = qs.filter(reminder__medication__profile_id=profile_id)
        return qs

    def _assert_owns_reminder(self, serializer):
        # Two hops from a profile: reminder -> medication -> profile.
        reminder = serializer.validated_data.get('reminder')
        medication = getattr(reminder, 'medication', None)
        assert_owns_profile(self.request.user, getattr(medication, 'profile', None))

    def perform_create(self, serializer):
        self._assert_owns_reminder(serializer)
        serializer.save()

    def perform_update(self, serializer):
        if 'reminder' in serializer.validated_data:
            self._assert_owns_reminder(serializer)
        serializer.save()
