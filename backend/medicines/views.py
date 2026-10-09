from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from doctors.access import acting_doctor, readable_profile_ids
from family.models import Profile
from family.permissions import assert_owns_profile, profile_id_param
from .consolidation import ensure_fresh, rebuild_profile_medications
from .models import DoseLog, Medication, MedicationMatchDecision, MedicationOccurrence, ReminderSchedule
from .serializers import (
    DoctorMedicationSerializer,
    DoseLogSerializer,
    MedicationPairSerializer,
    MedicationSerializer,
    MedicationStatusSerializer,
    ReminderScheduleSerializer,
)


class MedicationPagination(PageNumberPagination):
    """
    A medicines list is read in one go: every screen showing it (web, the
    mobile app, the emergency card) only ever reads the first page, so the
    global page size of 20 silently hid the rest of a long list.
    """
    page_size = 200
    page_size_query_param = 'page_size'
    max_page_size = 500


def _survivor(medication):
    """The row a merged medication now lives on."""
    seen = set()
    while medication.merged_into_id and medication.pk not in seen:
        seen.add(medication.pk)
        medication = medication.merged_into
    return medication


class MedicationViewSet(viewsets.ModelViewSet):
    """
    /api/medications/ — a profile's medicines, one row per medicine however
    many prescriptions mention it (medicines/consolidation.py), each with its
    status and full prescription history.

    ?scope=current (default) lists what the person is currently meant to be
    taking; ?scope=past lists discontinued, completed and one-time medicines;
    ?scope=all lists both. Rows folded into another medicine, and medicines
    whose every prescription was deleted, are never listed.

    A doctor with an APPROVED DoctorPatientAccess grant can also READ an
    approved patient's ACTIVE medications here, mirroring how
    AllergyRecordViewSet already grants doctors read access. Doctors get the
    narrower DoctorMedicationSerializer (no personal reminder schedule) and
    can never create/update/delete a patient's medication. "Doctor" here
    means a request acting in doctor mode (doctors/access.py) — the same
    account in user mode manages its own family's medicines like any patient.
    """
    serializer_class = MedicationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = MedicationPagination

    def _is_doctor(self):
        return acting_doctor(self.request) is not None

    def get_serializer_class(self):
        if self._is_doctor():
            return DoctorMedicationSerializer
        return MedicationSerializer

    def _profile_ids(self):
        doctor = acting_doctor(self.request)
        if doctor:
            ids = set(readable_profile_ids(doctor))
        else:
            ids = set(Profile.objects.filter(account=self.request.user).values_list('id', flat=True))
        profile_id = profile_id_param(self.request)
        if profile_id:
            ids = {pk for pk in ids if str(pk) == profile_id}
        return ids

    def get_queryset(self):
        doctor = acting_doctor(self.request)
        profile_ids = self._profile_ids()
        qs = Medication.objects.filter(
            profile_id__in=profile_ids, merged_into__isnull=True, is_archived=False
        )
        if doctor:
            # Only what the patient is currently taking — a discontinued
            # medicine shown as current would be actively misleading.
            qs = qs.filter(is_active=True)
        elif self.action == 'list':
            scope = self.request.query_params.get('scope', 'current')
            if scope == 'current':
                qs = qs.filter(is_active=True)
            elif scope == 'past':
                qs = qs.filter(is_active=False)
            elif scope != 'all':
                raise ValidationError({'scope': 'Use current, past or all.'})
        occurrences = MedicationOccurrence.objects.select_related('source_document')
        # Stable order so pagination cannot repeat or skip a medicine.
        return qs.prefetch_related('reminders', Prefetch('occurrences', queryset=occurrences)).order_by('name', 'id')

    def list(self, request, *args, **kwargs):
        # Statuses depend on today's date (a course ends), so recompute any
        # profile not yet computed today before answering.
        ensure_fresh(self._profile_ids())
        return super().list(request, *args, **kwargs)

    @staticmethod
    def _refreshed(medication):
        medication = _survivor(Medication.objects.select_related('merged_into').get(pk=medication.pk))
        return Medication.objects.prefetch_related(
            'reminders', Prefetch('occurrences', queryset=MedicationOccurrence.objects.select_related('source_document'))
        ).get(pk=medication.pk)

    def _guard_write(self, message):
        if self._is_doctor():
            raise PermissionDenied(message)

    def perform_create(self, serializer):
        self._guard_write("Doctors cannot add medications on behalf of a patient.")
        assert_owns_profile(self.request.user, serializer.validated_data.get('profile'))
        medication = serializer.save(origin=Medication.Origin.MANUAL)
        rebuild_profile_medications(medication.profile)
        # Added by hand but already on the list from a prescription: the
        # response (and any reminder the app adds next) is the one record.
        serializer.instance = self._refreshed(medication)

    def perform_update(self, serializer):
        self._guard_write("Doctors cannot edit a patient's medications.")
        if 'profile' in serializer.validated_data:
            assert_owns_profile(self.request.user, serializer.validated_data['profile'])
        medication = serializer.instance
        if 'is_active' in serializer.validated_data and medication.occurrences.exists():
            # On a prescription medicine, switching it off or on is the
            # person's own word about it — kept until a newer prescription.
            medication.user_status = (
                Medication.UserStatus.TAKING if serializer.validated_data['is_active']
                else Medication.UserStatus.STOPPED
            )
            medication.user_status_at = timezone.now()
        medication = serializer.save(user_status=medication.user_status, user_status_at=medication.user_status_at)
        rebuild_profile_medications(medication.profile)
        serializer.instance = self._refreshed(medication)

    def perform_destroy(self, instance):
        """
        A medicine that came from prescriptions is removed from the list but
        its history is kept — the prescriptions still say what they say, and
        a newer prescription naming it brings it back. A medicine added by
        hand, with nothing else attached, is deleted outright.
        """
        self._guard_write("Doctors cannot delete a patient's medications.")
        if instance.occurrences.exists() or instance.merged_rows.exists():
            instance.user_status = Medication.UserStatus.REMOVED
            instance.user_status_at = timezone.now()
            instance.save(update_fields=['user_status', 'user_status_at'])
            ReminderSchedule.objects.filter(medication=instance).update(is_active=False)
            rebuild_profile_medications(instance.profile)
        else:
            instance.delete()

    @action(detail=True, methods=['post'], url_path='set-status')
    def set_status(self, request, pk=None):
        """POST {"status": "taking" | "stopped"} — the person's own answer to "still taking it?"."""
        self._guard_write("Doctors cannot edit a patient's medications.")
        medication = self.get_object()
        body = MedicationStatusSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        medication.user_status = body.validated_data['status']
        medication.user_status_at = timezone.now()
        medication.save(update_fields=['user_status', 'user_status_at'])
        rebuild_profile_medications(medication.profile)
        return Response(MedicationSerializer(self._refreshed(medication)).data)

    def _other(self, medication, request):
        body = MedicationPairSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        other = Medication.objects.filter(
            pk=body.validated_data['other'], profile=medication.profile, merged_into__isnull=True
        ).first()
        if other is None or other.pk == medication.pk:
            raise ValidationError({'other': 'No other medicine with that id on this profile.'})
        if not medication.match_key or not other.match_key:
            # Decisions are recorded against identity keys; make sure both have one.
            rebuild_profile_medications(medication.profile)
            medication.refresh_from_db()
            other.refresh_from_db()
        return other

    @action(detail=True, methods=['post'])
    def merge(self, request, pk=None):
        """
        POST {"other": "<id>"} — the person confirms <other> is the same
        medicine as this one. <other>'s prescriptions, reminders and history
        move here, and stay here on every future rebuild.
        """
        self._guard_write("Doctors cannot edit a patient's medications.")
        medication = self.get_object()
        other = self._other(medication, request)
        with transaction.atomic():
            MedicationMatchDecision.objects.filter(
                profile=medication.profile,
                key_from__in=[medication.match_key, other.match_key],
                key_to__in=[medication.match_key, other.match_key],
            ).delete()
            MedicationMatchDecision.objects.create(
                profile=medication.profile, key_from=other.match_key, key_to=medication.match_key,
                decision=MedicationMatchDecision.Decision.SAME,
            )
            rebuild_profile_medications(medication.profile)
        return Response(MedicationSerializer(self._refreshed(medication)).data)

    @action(detail=True, methods=['post'], url_path='keep-separate')
    def keep_separate(self, request, pk=None):
        """POST {"other": "<id>"} — not the same medicine; stop suggesting it."""
        self._guard_write("Doctors cannot edit a patient's medications.")
        medication = self.get_object()
        other = self._other(medication, request)
        first, second = sorted((medication.match_key, other.match_key))
        MedicationMatchDecision.objects.update_or_create(
            profile=medication.profile, key_from=first, key_to=second,
            defaults={'decision': MedicationMatchDecision.Decision.DIFFERENT},
        )
        rebuild_profile_medications(medication.profile)
        return Response(MedicationSerializer(self._refreshed(medication)).data)

    @action(detail=True, methods=['post'])
    def unmerge(self, request, pk=None):
        """Undoes the person's own merges into this medicine."""
        self._guard_write("Doctors cannot edit a patient's medications.")
        medication = self.get_object()
        MedicationMatchDecision.objects.filter(
            profile=medication.profile, key_to=medication.match_key,
            decision=MedicationMatchDecision.Decision.SAME,
        ).delete()
        rebuild_profile_medications(medication.profile)
        return Response(MedicationSerializer(self._refreshed(medication)).data)


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
        # A reminder added to a row that has since been merged belongs on
        # the medicine it was merged into, or it would never be shown.
        serializer.save(medication=_survivor(serializer.validated_data['medication']))

    def perform_update(self, serializer):
        if 'medication' in serializer.validated_data:
            self._assert_owns_medication(serializer)
            serializer.save(medication=_survivor(serializer.validated_data['medication']))
        else:
            serializer.save()


class DoseLogViewSet(viewsets.ModelViewSet):
    serializer_class = DoseLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = DoseLog.objects.filter(reminder__medication__profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
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
