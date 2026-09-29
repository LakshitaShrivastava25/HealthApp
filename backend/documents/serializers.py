from django.utils import timezone
from rest_framework import serializers

from .models import Document, TimelineEvent


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = [
            'id', 'profile', 'file', 'title', 'category', 'status',
            'doctor_name', 'hospital_name', 'document_date',
            'structured_data', 'uploaded_at', 'processed_at',
        ]
        read_only_fields = ['id', 'status', 'structured_data', 'uploaded_at', 'processed_at']

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


class DocumentCorrectionSerializer(serializers.Serializer):
    """Patient (or admin) correcting a misread structured field — logs the
    correction rather than silently overwriting, per the TDD's OCR trust rule."""
    structured_data = serializers.JSONField()


class TimelineEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimelineEvent
        fields = ['id', 'profile', 'source_document', 'event_date', 'event_type', 'title', 'summary']
