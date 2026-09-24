from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from family.permissions import assert_owns_profile
from .derived import rebuild_derived_records
from .models import Document, TimelineEvent
from .serializers import DocumentCorrectionSerializer, DocumentSerializer, TimelineEventSerializer


def _approved_profile_ids(user):
    """Profile ids a doctor currently has APPROVED consent to view. Import
    is local to avoid a circular import between documents and doctors."""
    from doctors.models import DoctorPatientAccess
    return DoctorPatientAccess.objects.filter(
        doctor=user.doctor_profile, status=DoctorPatientAccess.Status.APPROVED
    ).values_list('profile_id', flat=True)


class DocumentViewSet(viewsets.ModelViewSet):
    """
    /api/documents/ — Medical Locker. Upload triggers the OCR + Claude
    structuring pipeline synchronously for now (see note in perform_create);
    swap for a Celery task per the TDD once background workers are set up.

    A doctor with an APPROVED DoctorPatientAccess grant can READ a patient's
    documents (see get_queryset) but can never upload/correct/delete them —
    perform_create/update/destroy explicitly reject any doctor account, so
    this stays a patient-owned record even when a doctor is viewing it.
    """
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'doctor_profile'):
            qs = Document.objects.filter(profile_id__in=_approved_profile_ids(user))
        else:
            qs = Document.objects.filter(profile__account=user)
        profile_id = self.request.query_params.get('profile_id')
        category = self.request.query_params.get('category')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        if category:
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot upload documents on behalf of a patient.")
        assert_owns_profile(self.request.user, serializer.validated_data.get('profile'))
        document = serializer.save(status=Document.Status.PROCESSING)
        # TODO: move to a Celery task (documents/tasks.py) once Celery+Redis
        # are provisioned, so upload doesn't block on OCR+Claude latency.
        ClaudeService().process_document(document)

    def perform_update(self, serializer):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot edit a patient's documents.")
        if 'profile' in serializer.validated_data:
            assert_owns_profile(self.request.user, serializer.validated_data['profile'])
        serializer.save()

    def perform_destroy(self, instance):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot delete a patient's documents.")
        instance.delete()

    @action(detail=True, methods=['patch'])
    def correct(self, request, pk=None):
        """Patient corrects a misread field after reviewing OCR output."""
        if hasattr(request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot edit a patient's documents.")
        document = self.get_object()
        serializer = DocumentCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document.structured_data = {**document.structured_data, **serializer.validated_data['structured_data']}
        document.status = Document.Status.PROCESSED
        document.processed_at = timezone.now()
        document.save()
        # A correction changes what this document says, so what it implies
        # has to follow. Without this, fixing a misread medicine name would
        # leave the old name standing in the timeline and the medicines
        # list — the corrected record and the derived one disagreeing is
        # worse than never having derived anything.
        rebuild_derived_records(document)
        return Response(DocumentSerializer(document).data)


class TimelineEventViewSet(viewsets.ReadOnlyModelViewSet):
    """/api/timeline/ — read-only chronological view, built from Documents.
    Already read-only for everyone, so a doctor with approved consent
    simply needs to be included in the queryset — no write guard needed."""
    serializer_class = TimelineEventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'doctor_profile'):
            qs = TimelineEvent.objects.filter(profile_id__in=_approved_profile_ids(user))
        else:
            qs = TimelineEvent.objects.filter(profile__account=user)
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs
