import uuid

from django.db import models

from family.models import Profile


class Document(models.Model):
    """
    Central table for every uploaded medical file. structured_data is
    populated asynchronously by the OCR + Claude structuring pipeline
    (see ai/claude_service.py) — status tracks that pipeline's progress.
    """

    class Category(models.TextChoices):
        PRESCRIPTION = 'prescription', 'Prescription'
        REPORT = 'report', 'Report'
        SCAN = 'scan', 'Scan'
        DISCHARGE = 'discharge', 'Discharge Summary'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        PROCESSING = 'processing', 'Processing'
        PROCESSED = 'processed', 'Processed'
        NEEDS_REVIEW = 'needs_review', 'Needs Review'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='documents')
    file = models.FileField(upload_to='documents/%Y/%m/')
    title = models.CharField(max_length=255, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROCESSING)

    doctor_name = models.CharField(max_length=150, blank=True)
    hospital_name = models.CharField(max_length=150, blank=True)
    document_date = models.DateField(null=True, blank=True)

    raw_ocr_text = models.TextField(blank=True)
    structured_data = models.JSONField(default=dict, blank=True)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.title or f"Document {self.id}"


class TimelineEvent(models.Model):
    """
    Read model built from Document.structured_data — one row per health
    event (diagnosis, prescription, test, allergy...). Populated by the
    same background task that finishes OCR structuring (TDD §5.4), not
    computed on every request.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='timeline_events')
    source_document = models.ForeignKey(Document, on_delete=models.SET_NULL, null=True, blank=True, related_name='timeline_events')
    event_date = models.DateField()
    event_type = models.CharField(max_length=30)
    title = models.CharField(max_length=255)
    summary = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ['-event_date']

    def __str__(self):
        return f"{self.event_date} — {self.title}"
