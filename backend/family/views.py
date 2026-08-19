from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from .models import AllergyRecord, Profile
from .serializers import AllergyRecordSerializer, ProfileSerializer


class AskHealthQuestionSerializer(serializers.Serializer):
    question = serializers.CharField()


class ProfileViewSet(viewsets.ModelViewSet):
    """
    /api/profiles/ — family members under the logged-in account.
    Every other app (documents, insurance, medicines, emergency) filters
    by ?profile_id= against this table, matching the TDD's data model.

    A doctor with an APPROVED DoctorPatientAccess grant can also READ the
    patient's profile here (name, blood group, DOB, etc.) — without this,
    the Doctor Portal would have no way to show who its approved patients
    even are, since DoctorPatientAccess only stores a raw profile id.
    Doctors can never create/update/delete a profile or use /ask/ on one
    that isn't theirs.
    """
    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        own = Profile.objects.filter(account=user)
        if hasattr(user, 'doctor_profile'):
            from doctors.models import DoctorPatientAccess
            approved_profile_ids = DoctorPatientAccess.objects.filter(
                doctor=user.doctor_profile, status=DoctorPatientAccess.Status.APPROVED
            ).values_list('profile_id', flat=True)
            return (own | Profile.objects.filter(id__in=approved_profile_ids)).distinct()
        return own

    def perform_create(self, serializer):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot create patient profiles.")
        serializer.save(account=self.request.user)

    def perform_update(self, serializer):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot edit a patient's profile.")
        serializer.save()

    def perform_destroy(self, instance):
        if hasattr(self.request.user, 'doctor_profile'):
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
        if hasattr(request.user, 'doctor_profile'):
            raise PermissionDenied("The AI Health Assistant is a patient feature.")
        profile = self.get_object()
        serializer = AskHealthQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        context = {
            'name': profile.full_name,
            'blood_group': profile.blood_group,
            'allergies': list(profile.allergies.values_list('substance', flat=True)),
        }
        result = ClaudeService().answer_health_question(
            profile, serializer.validated_data['question'], context, history=[]
        )
        return Response(result, status=status.HTTP_200_OK)


class AllergyRecordViewSet(viewsets.ModelViewSet):
    serializer_class = AllergyRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'doctor_profile'):
            from doctors.models import DoctorPatientAccess
            approved_profile_ids = DoctorPatientAccess.objects.filter(
                doctor=user.doctor_profile, status=DoctorPatientAccess.Status.APPROVED
            ).values_list('profile_id', flat=True)
            qs = AllergyRecord.objects.filter(profile_id__in=approved_profile_ids)
        else:
            qs = AllergyRecord.objects.filter(profile__account=user)
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs

    def perform_create(self, serializer):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot add allergy records on behalf of a patient.")
        serializer.save()

    def perform_update(self, serializer):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot edit a patient's allergy records.")
        serializer.save()

    def perform_destroy(self, instance):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot delete a patient's allergy records.")
        instance.delete()
