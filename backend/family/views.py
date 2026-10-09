from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from config.throttling import ActionThrottleMixin
from doctors.access import acting_doctor, readable_profile_ids
from .models import AllergyRecord, Notification, Profile
from .permissions import assert_owns_profile, profile_id_param
from .serializers import AllergyRecordSerializer, NotificationSerializer, ProfileSerializer


class AskHealthQuestionSerializer(serializers.Serializer):
    # Every question is a paid AI call; a question has no business being an essay.
    question = serializers.CharField(max_length=1000)


class ProfileViewSet(ActionThrottleMixin, viewsets.ModelViewSet):
    """
    /api/profiles/ — family members under the logged-in account.
    Every other app (documents, insurance, medicines, emergency) filters
    by ?profile_id= against this table, matching the TDD's data model.

    A doctor with an APPROVED DoctorPatientAccess grant can also READ the
    patient's profile here (name, blood group, DOB, etc.) — without this,
    the Doctor Portal would have no way to show who its approved patients
    even are, since DoctorPatientAccess only stores a raw profile id.
    In doctor mode nothing here is writable and /ask/ is unavailable.

    The same account in user mode (?acting_as=patient, see doctors/access.py)
    is simply a patient: it manages its own family's profiles like any other
    account, which is what lets a doctor use CuraPath for their own health.
    """
    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]
    action_throttle_scopes = {'ask': 'ai'}

    def get_queryset(self):
        own = Profile.objects.filter(account=self.request.user)
        doctor = acting_doctor(self.request)
        if doctor:
            return (own | Profile.objects.filter(id__in=readable_profile_ids(doctor))).distinct()
        return own

    def perform_create(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot create patient profiles.")
        serializer.save(account=self.request.user)

    def perform_update(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot edit a patient's profile.")
        serializer.save()

    def perform_destroy(self, instance):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot delete a patient's profile.")
        instance.delete()

    @action(detail=True, methods=['post'], url_path='ask')
    def ask(self, request, pk=None):
        """
        POST /api/profiles/{id}/ask/ — the Dashboard's "AI Health Assistant"
        box. Grounded in this profile's own timeline/allergies, per the
        TDD's health-chat rules (see ai/claude_service.py). Patient-only —
        the AI assistant is a patient-facing feature, not a doctor tool.
        """
        if acting_doctor(request):
            raise PermissionDenied("The AI Health Assistant is a patient feature.")
        profile = self.get_object()
        serializer = AskHealthQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        context = {
            'name': profile.full_name,
            'blood_group': profile.blood_group,
            'allergies': list(profile.allergies.values_list('substance', flat=True)),
            'active_medications': [
                {
                    'name': m.name,
                    'dosage': m.dosage,
                    'frequency': m.frequency,
                    'instructions': m.instructions,
                    'reminder_times': list(
                        m.reminders.filter(is_active=True).values_list('time_of_day', flat=True)
                    ),
                }
                for m in profile.medications.filter(is_active=True)
            ],
            'recent_documents': [
                {
                    'title': d.title,
                    'category': d.category,
                    'document_date': d.document_date,
                    'hospital_name': d.hospital_name,
                }
                for d in profile.documents.all()[:10]
            ],
            'recent_timeline_events': [
                {
                    'event_date': e.event_date,
                    'event_type': e.event_type,
                    'title': e.title,
                    'summary': e.summary,
                }
                for e in profile.timeline_events.all()[:10]
            ],
        }
        result = ClaudeService().answer_health_question(
            profile, serializer.validated_data['question'], context, history=[]
        )
        return Response(result, status=status.HTTP_200_OK)


class AllergyRecordViewSet(viewsets.ModelViewSet):
    serializer_class = AllergyRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        doctor = acting_doctor(self.request)
        if doctor:
            qs = AllergyRecord.objects.filter(profile_id__in=readable_profile_ids(doctor))
        else:
            qs = AllergyRecord.objects.filter(profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        # Stable order so pagination cannot repeat or skip an allergy.
        return qs.order_by('-recorded_at')

    def perform_create(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot add allergy records on behalf of a patient.")
        assert_owns_profile(self.request.user, serializer.validated_data.get('profile'))
        serializer.save()

    def perform_update(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot edit a patient's allergy records.")
        # Also checked on update: without it a record could be moved onto
        # someone else's profile by PATCHing the foreign key.
        if 'profile' in serializer.validated_data:
            assert_owns_profile(self.request.user, serializer.validated_data['profile'])
        serializer.save()

    def perform_destroy(self, instance):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot delete a patient's allergy records.")
        instance.delete()


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/notifications/?profile_id=<id> — generated alerts for a profile,
    filtered by profile_id the same way documents/timeline/allergies do.

    Read-only: these rows are produced by the `generate_reminders`
    management command, never posted by a client. Unlike allergies, a
    doctor gets nothing here even for an approved patient — a premium
    renewal or a personal medicine-reminder schedule is the patient's own
    business, not clinical information a doctor needs.
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs

    @action(detail=True, methods=['post'], url_path='mark_read')
    def mark_read(self, request, pk=None):
        """POST /api/notifications/<id>/mark_read/ — flip is_read to True."""
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)
