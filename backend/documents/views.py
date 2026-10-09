from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from config.throttling import ActionThrottleMixin
from doctors.access import acting_doctor, readable_profile_ids
from family.permissions import assert_owns_profile, profile_id_param
from .derived import rebuild_derived_records
from .models import Document, TimelineEvent
from .serializers import DocumentCorrectionSerializer, DocumentSerializer, TimelineEventSerializer


class DocumentViewSet(ActionThrottleMixin, viewsets.ModelViewSet):
    """
    /api/documents/ — Medical Locker. Upload triggers the OCR + Claude
    structuring pipeline synchronously for now (see note in perform_create);
    swap for a Celery task per the TDD once background workers are set up.

    A doctor with an APPROVED DoctorPatientAccess grant can READ a patient's
    documents (see get_queryset) but can never upload/correct/delete them —
    perform_create/update/destroy explicitly reject doctor mode, so this
    stays a patient-owned record even when a doctor is viewing it. The same
    account in user mode manages its own family's documents as any patient.
    """
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]
    # Each upload and each retry runs the paid extraction pipeline.
    action_throttle_scopes = {'create': 'uploads', 'retry_processing': 'ai'}

    def get_queryset(self):
        doctor = acting_doctor(self.request)
        if doctor:
            qs = Document.objects.filter(profile_id__in=readable_profile_ids(doctor))
        else:
            qs = Document.objects.filter(profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
        category = self.request.query_params.get('category')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        if category:
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot upload documents on behalf of a patient.")
        assert_owns_profile(self.request.user, serializer.validated_data.get('profile'))
        document = serializer.save(status=Document.Status.PROCESSING)
        # TODO: move to a Celery task (documents/tasks.py) once Celery+Redis
        # are provisioned, so upload doesn't block on OCR+Claude latency.
        ClaudeService().process_document(document)

    def perform_update(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot edit a patient's documents.")
        if 'profile' in serializer.validated_data:
            assert_owns_profile(self.request.user, serializer.validated_data['profile'])
        document = serializer.save()
        rebuild_derived_records(document)

    def perform_destroy(self, instance):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot delete a patient's documents.")
        instance.delete()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """
        POST /api/documents/<id>/confirm/ — the person has reviewed the
        extracted details on the review screen and confirms they are right.

        This is the ONLY thing that moves a document to PROCESSED. The
        review screen saves its edits through the ordinary PATCH on this
        viewset first and then calls this, mirroring the insurance flow
        (update, then confirm), so this stays a single auditable "a human
        agreed" step rather than a second write path.

        The derived records are rebuilt afterwards because the PATCH that
        just ran may have corrected the very fields they are built from —
        a fixed title or date would otherwise stay wrong on the timeline.
        """
        if acting_doctor(request):
            raise PermissionDenied("Doctors cannot confirm a patient's documents.")
        document = self.get_object()
        document.status = Document.Status.PROCESSED
        document.processed_at = timezone.now()
        document.save(update_fields=['status', 'processed_at'])
        rebuild_derived_records(document)
        return Response(DocumentSerializer(document).data)

    @action(detail=True, methods=['post'], url_path='retry-processing')
    def retry_processing(self, request, pk=None):
        """
        POST /api/documents/<id>/retry-processing/ — re-run extraction on a
        document whose processing failed.

        The file is already stored, so a retry costs nothing but the call,
        which matters when the original failure was a transient API outage.
        """
        if acting_doctor(request):
            raise PermissionDenied("Doctors cannot process a patient's documents.")
        document = self.get_object()
        document.status = Document.Status.PROCESSING
        document.save(update_fields=['status'])
        ClaudeService().process_document(document)
        document.refresh_from_db()
        return Response(DocumentSerializer(document).data)

    @action(detail=True, methods=['patch'])
    def correct(self, request, pk=None):
        """Patient corrects a misread field after reviewing OCR output."""
        if acting_doctor(request):
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
        doctor = acting_doctor(self.request)
        if doctor:
            qs = TimelineEvent.objects.filter(profile_id__in=readable_profile_ids(doctor))
        else:
            qs = TimelineEvent.objects.filter(profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs
