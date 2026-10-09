from django.utils import timezone
from rest_framework import serializers

from .models import Document, TimelineEvent
from .validators import validate_upload


class DocumentSerializer(serializers.ModelSerializer):
    possible_duplicate = serializers.SerializerMethodField()
    copies = serializers.SerializerMethodField()
    upload_history = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'profile', 'file', 'title', 'category', 'status',
            'doctor_name', 'hospital_name', 'document_date',
            'structured_data', 'uploaded_at', 'processed_at',
            'original_filename', 'duplicate_of', 'duplicate_kind',
            'possible_duplicate', 'copies', 'upload_history',
        ]
        read_only_fields = [
            'id', 'status', 'structured_data', 'uploaded_at', 'processed_at',
            'original_filename', 'duplicate_of', 'duplicate_kind',
        ]
        # PDFs and photos only, checked by content (documents/validators.py).
        extra_kwargs = {'file': {'validators': [validate_upload]}}

    def validate_document_date(self, value):
        """
        document_date is when the scan or report was taken, so it can never
        be after today. The review screen caps its date picker too, but that
        is only a convenience — this runs on both the upload (POST) and the
        review screen's edit (PATCH), which is the write path the Confirm
        button actually uses.

        Compared against localdate(), not utcnow().date(): TIME_ZONE is
        Asia/Kolkata, and a UTC comparison would reject today as "future"
        for anyone filling this in before 05:30 IST.
        """
        if value and value > timezone.localdate():
            raise serializers.ValidationError('Document date cannot be in the future.')
        return value

    def get_possible_duplicate(self, document):
        other = document.possible_duplicate_of
        if other is None or document.duplicate_of_id:
            return None
        return {
            'id': str(other.id),
            'title': other.title,
            'uploaded_at': other.uploaded_at,
            'document_date': other.document_date,
            'score': document.possible_duplicate_score,
            'shared_pages': document.possible_duplicate_pages or [],
        }

    def get_copies(self, document):
        return [
            {
                'id': str(copy.id),
                'title': copy.title,
                'original_filename': copy.original_filename,
                'uploaded_at': copy.uploaded_at,
                'duplicate_kind': copy.duplicate_kind,
            }
            for copy in document.copies.all()
        ]

    def get_upload_history(self, document):
        return [
            {
                'original_filename': upload.original_filename,
                'uploaded_at': upload.created_at,
                'outcome': upload.outcome,
            }
            for upload in document.uploads.all()
        ]


class DocumentCorrectionSerializer(serializers.Serializer):
    """Patient (or admin) correcting a misread structured field — logs the
    correction rather than silently overwriting, per the TDD's OCR trust rule."""
    structured_data = serializers.JSONField()


class MarkDuplicateSerializer(serializers.Serializer):
    of = serializers.UUIDField()


class TimelineEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimelineEvent
        fields = ['id', 'profile', 'source_document', 'event_date', 'event_type', 'title', 'summary']

