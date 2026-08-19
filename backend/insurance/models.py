import uuid

from django.db import models

from family.models import Profile


class InsurancePolicy(models.Model):
    class Status(models.TextChoices):
        PROCESSING = 'processing', 'Processing'
        VALIDATED = 'validated', 'Validated'
        NEEDS_REVIEW = 'needs_review', 'Needs Review'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='insurance_policies')
    file = models.FileField(upload_to='insurance/%Y/%m/')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROCESSING)

    insurer = models.CharField(max_length=150, blank=True)
    policy_number = models.CharField(max_length=100, blank=True)
    plan_name = models.CharField(max_length=150, blank=True)
    policy_type = models.CharField(max_length=100, blank=True)
    sum_insured = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    coverage_start = models.DateField(null=True, blank=True)
    coverage_end = models.DateField(null=True, blank=True)
    room_rent_limit = models.CharField(max_length=100, blank=True)
    co_payment_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    raw_text = models.TextField(blank=True)
    structured_data = models.JSONField(default=dict, blank=True)
    schema_version = models.PositiveSmallIntegerField(default=1)

    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.insurer or 'Policy'} — {self.profile.full_name}"


class PolicyExclusion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey(InsurancePolicy, on_delete=models.CASCADE, related_name='exclusions')
    description = models.CharField(max_length=500)


class PolicyWaitingPeriod(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey(InsurancePolicy, on_delete=models.CASCADE, related_name='waiting_periods')
    condition = models.CharField(max_length=255)
    months = models.PositiveSmallIntegerField()

    @property
    def waiting_until(self):
        if not self.policy.coverage_start:
            return None
        # approx month math without extra deps
        y = self.policy.coverage_start.year + (self.policy.coverage_start.month - 1 + self.months) // 12
        m = (self.policy.coverage_start.month - 1 + self.months) % 12 + 1
        from datetime import date
        return date(y, m, self.policy.coverage_start.day)


class PolicySubLimit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey(InsurancePolicy, on_delete=models.CASCADE, related_name='sub_limits')
    category = models.CharField(max_length=150)
    limit_text = models.CharField(max_length=255)


class ClaimEstimate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey(InsurancePolicy, on_delete=models.CASCADE, related_name='claim_estimates')
    claim_category = models.CharField(max_length=150)
    estimated_bill = models.DecimalField(max_digits=12, decimal_places=2)
    eligible = models.BooleanField()
    estimated_insurer_share = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    estimated_out_of_pocket = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reasoning_summary = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class InsuranceChatMessage(models.Model):
    class Role(models.TextChoices):
        USER = 'user', 'User'
        AI = 'ai', 'AI'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey(InsurancePolicy, on_delete=models.CASCADE, related_name='chat_messages')
    role = models.CharField(max_length=10, choices=Role.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
