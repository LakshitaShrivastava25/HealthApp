from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from config.throttling import ActionThrottleMixin
from doctors.access import acting_doctor, readable_profile_ids
from family.models import Profile
from family.permissions import assert_owns_profile, profile_id_param
from medicines.consolidation import rebuild_profile_medications
from .derived import rebuild_derived_records
from .duplicates import file_digest, find_exact_original
from .models import Document, DocumentUpload, TimelineEvent
from .serializers import (
    DocumentCorrectionSerializer,
    DocumentSerializer,
    MarkDuplicateSerializer,
    TimelineEventSerializer,
)


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
        if self.action == 'list' and self.request.query_params.get('include_duplicates') not in ('1', 'true'):
            # A verified copy is shown under its original, not as a second
            # entry in the locker. It stays reachable by id.
            qs = qs.filter(duplicate_of__isnull=True)
        return qs.select_related('possible_duplicate_of').prefetch_related('copies', 'uploads')

    def create(self, request, *args, **kwargs):
        """
        POST /api/documents/ — upload a document.

        The file's SHA-256 is checked against this profile's documents
        first. The exact same file, under any filename, is not stored or
        processed a second time: the response is the document already in the
        locker (HTTP 200, `upload.outcome == "exact_duplicate"`) and the
        attempt is logged in its upload history. Old app builds simply see
        their upload "succeed" without a second copy appearing.
        """
        if acting_doctor(request):
            raise PermissionDenied("Doctors cannot upload documents on behalf of a patient.")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.validated_data.get('profile')
        assert_owns_profile(request.user, profile)

        upload = serializer.validated_data['file']
        sha256, size = file_digest(upload)
        filename = (upload.name or '')[:255]

        with transaction.atomic():
            # One upload per profile at a time, so a double-tap cannot store
            # the same file twice between the check and the insert.
            Profile.objects.select_for_update().filter(pk=profile.pk).first()
            existing = find_exact_original(profile.pk, sha256)
            if existing is None:
                document = serializer.save(
                    status=Document.Status.PROCESSING,
                    original_filename=filename,
                    file_sha256=sha256,
                    file_size=size,
                )
            DocumentUpload.objects.create(
                profile=profile,
                document=existing or document,
                original_filename=filename,
                file_sha256=sha256,
                file_size=size,
                outcome=DocumentUpload.Outcome.EXACT_DUPLICATE if existing else DocumentUpload.Outcome.NEW,
            )

        if existing is not None:
            data = dict(self.get_serializer(self._fresh(existing)).data)
            data['upload'] = {
                'outcome': DocumentUpload.Outcome.EXACT_DUPLICATE,
                'existing_uploaded_at': existing.uploaded_at,
                'message': (
                    f'This file is already in the locker as “{existing.title or existing.original_filename}”, '
                    f'uploaded on {timezone.localtime(existing.uploaded_at):%d %b %Y}. '
                    f'It was not added again.'
                ),
            }
            return Response(data, status=status.HTTP_200_OK)

        # TODO: move to a Celery task (documents/tasks.py) once Celery+Redis
        # are provisioned, so upload doesn't block on OCR+Claude latency.
        ClaudeService().process_document(document)
        data = dict(self.get_serializer(self._fresh(document)).data)
        data['upload'] = {'outcome': DocumentUpload.Outcome.NEW}
        return Response(data, status=status.HTTP_201_CREATED, headers=self.get_success_headers(data))

    @staticmethod
    def _fresh(document):
        return (
            Document.objects.select_related('possible_duplicate_of')
            .prefetch_related('copies', 'uploads')
            .get(pk=document.pk)
        )

    def perform_update(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot edit a patient's documents.")
        if 'profile' in serializer.validated_data:
            assert_owns_profile(self.request.user, serializer.validated_data['profile'])
        document = serializer.save()
        rebuild_derived_records(document)

    def perform_destroy(self, instance):
        """
        Deleting an original that has copies promotes the earliest copy, so
        the prescription itself stays on record. Either way the profile's
        medicines are recomputed: a deleted prescription's medicines no
        longer linger on the list as if nothing had happened.
        """
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot delete a patient's documents.")
        profile = instance.profile
        with transaction.atomic():
            copies = list(instance.copies.order_by('uploaded_at'))
            heir = copies[0] if copies else None
            if heir is not None:
                Document.objects.filter(pk__in=[c.pk for c in copies[1:]]).update(duplicate_of=heir)
                heir.duplicate_of = None
                heir.duplicate_kind = ''
                heir.save(update_fields=['duplicate_of', 'duplicate_kind'])
            instance.delete()
        if heir is not None:
            heir.refresh_from_db()
            rebuild_derived_records(heir)
        else:
            rebuild_profile_medications(profile)

    @action(detail=True, methods=['post'], url_path='mark-duplicate')
    def mark_duplicate(self, request, pk=None):
        """
        POST /api/documents/<id>/mark-duplicate/ {"of": "<document id>"} —
        the person confirms this is a copy of another document. The file is
        kept; it stops contributing timeline events and medicines.
        """
        if acting_doctor(request):
            raise PermissionDenied("Doctors cannot edit a patient's documents.")
        document = self.get_object()
        body = MarkDuplicateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        original = Document.objects.filter(pk=body.validated_data['of'], profile=document.profile).first()
        if original is None:
            raise ValidationError({'of': 'No such document on this profile.'})
        original = original.duplicate_of or original
        if original.pk == document.pk:
            raise ValidationError({'of': 'A document cannot be a duplicate of itself.'})
        with transaction.atomic():
            # Anything that was a copy of this one is now a copy of the original.
            Document.objects.filter(duplicate_of=document).update(duplicate_of=original)
            document.duplicate_of = original
            document.duplicate_kind = Document.DuplicateKind.MANUAL
            document.possible_duplicate_of = None
            document.possible_duplicate_score = None
            document.possible_duplicate_pages = []
            document.save()
        rebuild_derived_records(document)
        return Response(self.get_serializer(self._fresh(document)).data)

    @action(detail=True, methods=['post'], url_path='not-duplicate')
    def not_duplicate(self, request, pk=None):
        """
        POST /api/documents/<id>/not-duplicate/ — the person says this is
        its own document. Undoes a link to another document, or dismisses a
        "possibly the same as" suggestion, and stops either coming back.
        """
        if acting_doctor(request):
            raise PermissionDenied("Doctors cannot edit a patient's documents.")
        document = self.get_object()
        was_copy = document.duplicate_of_id is not None
        document.duplicate_of = None
        document.duplicate_kind = ''
        document.possible_duplicate_of = None
        document.possible_duplicate_score = None
        document.possible_duplicate_pages = []
        document.duplicate_check_dismissed = True
        document.save()
        if was_copy:
            rebuild_derived_records(document)
        return Response(self.get_serializer(self._fresh(document)).data)

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
        return Response(DocumentSerializer(self._fresh(document)).data)

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
        return Response(DocumentSerializer(self._fresh(document)).data)

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
        return Response(DocumentSerializer(self._fresh(document)).data)


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
