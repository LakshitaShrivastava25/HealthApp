import uuid

from django.db import models
from django.utils import timezone

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

    class DuplicateKind(models.TextChoices):
        EXACT = 'exact', 'Byte-for-byte the same file'
        SAME_CONTENT = 'same_content', 'Same text on every page'
        MANUAL = 'manual', 'Marked as a duplicate by the person'

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

    # Duplicate detection (documents/duplicates.py). The filename is kept
    # for traceability only — it is never evidence that two files match.
    original_filename = models.CharField(max_length=255, blank=True)
    file_sha256 = models.CharField(max_length=64, blank=True, db_index=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    # One hash per page of normalised extracted text ('' for a blank page).
    page_fingerprints = models.JSONField(default=list, blank=True)
    # Set on a verified copy of another document. A copy keeps its file but
    # adds nothing to the timeline or the medicines list.
    duplicate_of = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='copies'
    )
    duplicate_kind = models.CharField(max_length=20, choices=DuplicateKind.choices, blank=True)
    # An unverified match (shared pages, very similar text) for the person to
    # confirm or dismiss. Never acted on automatically.
    possible_duplicate_of = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    possible_duplicate_score = models.FloatField(null=True, blank=True)
    possible_duplicate_pages = models.JSONField(default=list, blank=True)
    # The person said "not a duplicate" — no content check links it again.
    duplicate_check_dismissed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.title or f"Document {self.id}"


class DocumentUpload(models.Model):
    """
    Every upload attempt, including the ones that turned out to be a file
    already in the locker. An exact re-upload creates no second Document, so
    this is where "uploaded again on <date> as <filename>" is remembered.
    """

    class Outcome(models.TextChoices):
        NEW = 'new', 'New document'
        EXACT_DUPLICATE = 'exact_duplicate', 'Already in the locker'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='document_uploads')
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='uploads')
    original_filename = models.CharField(max_length=255, blank=True)
    file_sha256 = models.CharField(max_length=64, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['created_at']


class TimelineEvent(models.Model):
    """
    Read model built from Document.structured_data — one row per health
    event (diagnosis, prescription, test, allergy...). Populated by the
    same background task that finishes OCR structuring (TDD §5.4), not
    computed on every request.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='timeline_events')
    source_document = models.ForeignKey(Document, on_delete=models.CASCADE, null=True, blank=True, related_name='timeline_events')
    event_date = models.DateField()
    event_type = models.CharField(max_length=30)
    title = models.CharField(max_length=255)
    summary = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ['-event_date']

    def __str__(self):
        return f"{self.event_date} — {self.title}"


class StoredFile(models.Model):
    """
    The bytes behind every FileField in the project (documents, insurance
    policies, doctor licences) — see documents/storage.py for why they live
    in the database rather than on disk.
    """

    name = models.CharField(max_length=255, unique=True)
    content = models.BinaryField()
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
