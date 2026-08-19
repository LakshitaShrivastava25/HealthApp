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


class DocumentCorrectionSerializer(serializers.Serializer):
    """Patient (or admin) correcting a misread structured field — logs the
    correction rather than silently overwriting, per the TDD's OCR trust rule."""
    structured_data = serializers.JSONField()


class TimelineEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimelineEvent
        fields = ['id', 'profile', 'source_document', 'event_date', 'event_type', 'title', 'summary']
