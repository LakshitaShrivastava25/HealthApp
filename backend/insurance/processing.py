"""
Reading an uploaded insurance policy: text extraction, AI structuring, and
copying the result into the fields and rows the apps display.

This runs in a background thread, never inside the upload request. A long
policy's AI call alone can outlast Gunicorn's worker timeout and nginx's
proxy read timeout; when it ran in the request, the worker was killed
mid-read, the person was told the upload failed, and the policy stayed in
"processing" for good. Same stopgap as documents/views.py until a real task
queue exists.
"""
import logging
import threading
from datetime import timedelta

from django.conf import settings
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone

from ai.claude_service import ClaudeService
from ai.text_extraction import extract_text

from .models import InsurancePolicy, PolicyExclusion, PolicySubLimit, PolicyWaitingPeriod

logger = logging.getLogger(__name__)

STILL_READING = 'This policy is still being read. Try again once it finishes.'

# A read that has not finished after this long was running in a server
# process that no longer exists (a deploy or restart kills the thread), so it
# never will. Comfortably above the slowest real read (a couple of minutes).
STALE_PROCESSING_AFTER = timedelta(minutes=10)

FAILED_NOTE = (
    'Your policy was saved, but reading it failed unexpectedly. '
    'Try reading it again, or add the details yourself.'
)
INTERRUPTED_NOTE = (
    'Reading this policy was interrupted. '
    'Try reading it again, or add the details yourself.'
)

# Every field the read writes. Saving only these (never a bare save()) also
# means a policy deleted mid-read raises instead of being re-inserted.
READ_FIELDS = [
    'raw_text', 'structured_data', 'status', 'insurer', 'policy_number', 'policy_type',
    'plan_name', 'sum_insured', 'premium_amount', 'coverage_start', 'coverage_end',
    'room_rent_limit', 'co_payment_percent',
]


def analyze_policy(policy: InsurancePolicy) -> None:
    """Read `policy`'s file and fill it in. Always ends in NEEDS_REVIEW:
    only the person's own confirm makes a policy VALIDATED.

    The slow part (extraction and the AI call) runs outside any transaction;
    every write happens together at the end, so a read never leaves a policy
    half-filled, and a policy deleted mid-read stays deleted.
    """
    extraction = extract_text(policy.file)
    policy.raw_text = extraction.text or ''
    policy.status = InsurancePolicy.Status.NEEDS_REVIEW

    result = None
    if not extraction.succeeded:
        # Nothing to structure — skip the Claude call entirely rather than
        # sending it an empty string and pretending that's a normal "no
        # findings" result. The person needs to know WHY, not just see a
        # blank policy.
        policy.structured_data = {
            '_extraction_failed': True,
            'note': extraction.note or 'Could not extract text from this file.',
        }
    else:
        result = ClaudeService().analyze_insurance_policy(policy)
        policy.structured_data = result
        if extraction.note and isinstance(policy.structured_data, dict):
            # Extraction succeeded overall but some pages had no readable
            # text — likely a scanned annexure mixed into an otherwise digital
            # PDF. This is why exclusions/waiting periods/sub-limits can stay
            # empty even when the policy number and dates came through fine.
            policy.structured_data['_extraction_warning'] = extraction.note

    usable = isinstance(result, dict) and not result.get('_mock') and not result.get('_extraction_failed')

    with transaction.atomic():
        # A re-read replaces what an earlier one found rather than adding to it.
        policy.exclusions.all().delete()
        policy.waiting_periods.all().delete()
        policy.sub_limits.all().delete()

        if not usable:
            # Extraction failed, mock mode (no ANTHROPIC_API_KEY) or an
            # unusable response — nothing real to copy into the fields.
            policy.save(update_fields=['raw_text', 'structured_data', 'status'])
            return

        # The AI output only becomes visible once it is copied into the
        # fields the apps display and the Exclusion/WaitingPeriod/SubLimit
        # rows their cards read from.
        policy.insurer = result.get('insurer') or ''
        policy.policy_number = result.get('policy_number') or ''
        policy.policy_type = result.get('policy_type') or ''
        # The AI schema has no separate "plan name" — policy_type ("Family
        # Health Optima Insurance Plan") is the closest match, so it fills both.
        policy.plan_name = result.get('policy_type') or ''
        policy.sum_insured = result.get('sum_insured')
        policy.premium_amount = result.get('premium_amount')
        policy.coverage_start = result.get('coverage_start') or None
        policy.coverage_end = result.get('coverage_end') or None
        policy.room_rent_limit = result.get('room_rent_limit') or ''
        policy.co_payment_percent = result.get('co_payment_percent')
        policy.save(update_fields=READ_FIELDS)

        for item in result.get('exclusions') or []:
            if isinstance(item, str) and item.strip():
                PolicyExclusion.objects.create(policy=policy, description=item.strip()[:500])

        for item in result.get('waiting_periods') or []:
            if isinstance(item, dict) and item.get('condition') and item.get('months') is not None:
                PolicyWaitingPeriod.objects.create(
                    policy=policy, condition=str(item['condition'])[:255], months=item['months']
                )

        for item in result.get('sub_limits') or []:
            if isinstance(item, dict) and item.get('category') and item.get('limit'):
                PolicySubLimit.objects.create(
                    policy=policy, category=str(item['category'])[:150], limit_text=str(item['limit'])[:255]
                )


def _analyze_policy_background(policy_pk) -> None:
    """Thread body. Never leaves a policy in PROCESSING: any crash marks it
    for review with a note the apps can show."""
    in_test = getattr(settings, 'TESTING', False)
    try:
        policy = InsurancePolicy.objects.filter(pk=policy_pk).first()
        if policy is None:
            return  # deleted before the thread started
        try:
            analyze_policy(policy)
        except Exception:
            logger.exception('Reading insurance policy %s failed', policy_pk)
            # update() on a policy deleted mid-read is a harmless no-op.
            InsurancePolicy.objects.filter(pk=policy_pk).update(
                status=InsurancePolicy.Status.NEEDS_REVIEW,
                structured_data={'_extraction_failed': True, 'note': FAILED_NOTE},
            )
    finally:
        # The thread opened its own connection; nothing else will close it.
        if not in_test:
            connection.close()


def start_policy_analysis(policy_pk) -> None:
    """Read the policy in the background. Synchronous under tests, so they
    can inspect the result without waiting on a thread."""
    if getattr(settings, 'TESTING', False):
        _analyze_policy_background(policy_pk)
        return
    threading.Thread(target=_analyze_policy_background, args=(policy_pk,), daemon=True).start()


def expire_stale_processing(queryset) -> int:
    """Mark reads that can no longer finish as interrupted, so a policy is
    never left showing "processing" forever after a restart."""
    cutoff = timezone.now() - STALE_PROCESSING_AFTER
    return queryset.filter(status=InsurancePolicy.Status.PROCESSING).filter(
        Q(processing_started_at__lt=cutoff)
        | Q(processing_started_at__isnull=True, uploaded_at__lt=cutoff)
    ).update(
        status=InsurancePolicy.Status.NEEDS_REVIEW,
        structured_data={'_extraction_failed': True, '_interrupted': True, 'note': INTERRUPTED_NOTE},
    )
