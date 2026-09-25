import logging

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from .models import Document, TimelineEvent
from .serializers import DocumentCorrectionSerializer, DocumentSerializer, TimelineEventSerializer
from .timeline import remove_timeline_event, sync_timeline_event


logger = logging.getLogger(__name__)


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
        document = serializer.save(status=Document.Status.PROCESSING)
        # TODO: move to a Celery task (documents/tasks.py) once Celery+Redis
        # are provisioned, so upload doesn't block on OCR+Claude latency.
        self._process_safely(document)

    @staticmethod
    def _process_safely(document):
        """
        Run the AI pipeline so a failure can never leave a half-made record.

        Before this, a processing error propagated out of perform_create as
        an unhandled 500 AFTER the row and the file were already committed —
        the person saw "upload failed" while a broken, permanently
        unprocessed document sat in their locker. Confirmed live.

        The record is deliberately KEPT and marked FAILED rather than rolled
        back. Document.Status.FAILED already exists in the model for exactly
        this, and insurance/views.py already handles its own AI failures the
        same way (record kept, reason recorded). A DB transaction would also
        be wrong here specifically: the uploaded file is written to storage
        outside the transaction, so a rollback removes the row but leaves the
        file orphaned on disk, and throws away a file that arrived perfectly
        intact — forcing the person to upload it again to fix a problem on
        our side.
        """
        try:
            ClaudeService().process_document(document)
        except Exception as exc:  # noqa: BLE001 — any failure must be recorded, not raised
            logger.exception('Document processing failed for %s', document.pk)
            document.status = Document.Status.FAILED
            document.structured_data = {
                '_processing_failed': True,
                # The class name only — an exception's text can carry request
                # ids or key fragments, which must not reach a patient's screen.
                'note': (
                    'The file uploaded fine, but automatic reading of it failed '
                    '(%s). You can retry processing, or fill the details in yourself.'
                    % type(exc).__name__
                ),
            }
            document.save()

    def perform_update(self, serializer):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot edit a patient's documents.")
        document = serializer.save()
        # Editing an already-confirmed document must correct its timeline entry
        # too — a no-op while the document is still awaiting review.
        sync_timeline_event(document)

    def perform_destroy(self, instance):
        if hasattr(self.request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot delete a patient's documents.")
        remove_timeline_event(instance)
        instance.delete()

    @action(detail=True, methods=['post'], url_path='retry-processing')
    def retry_processing(self, request, pk=None):
        """
        POST /api/documents/<id>/retry-processing/ — re-run the AI pipeline
        on a document that failed.

        The file is already stored, so a retry costs nothing but the call —
        which matters when the original failure was a transient API outage.
        """
        if hasattr(request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot process a patient's documents.")
        document = self.get_object()
        document.status = Document.Status.PROCESSING
        document.save(update_fields=['status'])
        self._process_safely(document)
        document.refresh_from_db()
        return Response(DocumentSerializer(document).data)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """
        POST /api/documents/<id>/confirm/ — the person has reviewed the
        AI-extracted details and confirms they are correct.

        Mirrors insurance's confirm: this is the ONLY thing that moves a
        document to PROCESSED. Edits themselves go through the ordinary
        PATCH on this viewset first, exactly as the insurance flow does
        (update, then confirm), so this endpoint stays a single, auditable
        "a human agreed" step rather than a second write path.
        """
        if hasattr(request.user, 'doctor_profile'):
            raise PermissionDenied("Doctors cannot confirm a patient's documents.")
        document = self.get_object()
        document.status = Document.Status.PROCESSED
        document.processed_at = timezone.now()
        document.save(update_fields=['status', 'processed_at'])
        # Confirming is what puts a document into the person's history, so it
        # is what creates the Timeline entry — the same pairing seed_demo.py
        # has always written by hand.
        sync_timeline_event(document)
        return Response(DocumentSerializer(document).data)

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
        sync_timeline_event(document)
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
