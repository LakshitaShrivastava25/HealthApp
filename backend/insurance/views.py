from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from ai.text_extraction import extract_text
from .claim_estimator import estimate_claim
from .models import ClaimEstimate, InsuranceChatMessage, InsurancePolicy, PolicyExclusion, PolicySubLimit, PolicyWaitingPeriod
from .serializers import (
    AskInsuranceQuestionSerializer, ClaimEstimateRequestSerializer, ClaimEstimateSerializer,
    InsuranceChatMessageSerializer, InsurancePolicySerializer,
)


class InsurancePolicyViewSet(viewsets.ModelViewSet):
    serializer_class = InsurancePolicySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = InsurancePolicy.objects.filter(profile__account=self.request.user)
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs

    def perform_create(self, serializer):
        policy = serializer.save(status=InsurancePolicy.Status.PROCESSING)

        # Real text extraction — PDFs are genuinely read (pypdf, no
        # external service needed); images honestly report that OCR
        # isn't configured yet rather than silently producing nothing.
        # See ai/text_extraction.py for the full reasoning.
        extraction = extract_text(policy.file)
        policy.raw_text = extraction.text or ''
        if not extraction.succeeded:
            # Nothing to structure — skip the Claude call entirely rather
            # than sending it an empty string and pretending that's a
            # normal "no findings" result. The person needs to know WHY,
            # not just see a blank policy.
            policy.status = InsurancePolicy.Status.NEEDS_REVIEW
            policy.structured_data = {'_extraction_failed': True, 'note': extraction.note or 'Could not extract text from this file.'}
            policy.save()
            return

        result = ClaudeService().analyze_insurance_policy(policy)
        policy.structured_data = result
        if extraction.note:
            # Extraction succeeded overall (real fields got populated
            # below) but some pages had no readable text — likely a
            # scanned annexure mixed into an otherwise digital PDF. This
            # is why exclusions/waiting periods/sub-limits can stay empty
            # even when the policy number and dates came through fine.
            if isinstance(policy.structured_data, dict):
                policy.structured_data['_extraction_warning'] = extraction.note

        # The missing step, found by checking a real upload's actual data:
        # the Claude call was genuinely extracting everything correctly
        # (confirmed against a real policy — insurer, dates, sum insured,
        # all correct) and saving it into structured_data, but nothing
        # ever copied those values into the fields the page actually
        # displays, or created the related Exclusion/WaitingPeriod/
        # SubLimit rows the Exclusions/Waiting Periods/Sub-Limits cards
        # read from. So every policy showed real AI output sitting
        # unused in structured_data while the visible page stayed blank.
        if not isinstance(result, dict) or result.get('_mock') or result.get('_extraction_failed'):
            # Mock mode (no ANTHROPIC_API_KEY) — nothing real to copy.
            policy.status = InsurancePolicy.Status.NEEDS_REVIEW
            policy.save()
            return

        policy.insurer = result.get('insurer') or ''
        policy.policy_number = result.get('policy_number') or ''
        policy.policy_type = result.get('policy_type') or ''
        # The AI schema has no separate "plan name" concept — policy_type
        # ("Family Health Optima Insurance Plan") is the closest match,
        # so it fills both fields rather than leaving plan_name
        # permanently blank for every real upload.
        policy.plan_name = result.get('policy_type') or ''
        policy.sum_insured = result.get('sum_insured')
        policy.premium_amount = result.get('premium_amount')
        policy.coverage_start = result.get('coverage_start') or None
        policy.coverage_end = result.get('coverage_end') or None
        policy.room_rent_limit = result.get('room_rent_limit') or ''
        policy.co_payment_percent = result.get('co_payment_percent')
        policy.status = InsurancePolicy.Status.NEEDS_REVIEW
        policy.save()

        for item in result.get('exclusions') or []:
            if isinstance(item, str) and item.strip():
                PolicyExclusion.objects.create(policy=policy, description=item.strip())

        for item in result.get('waiting_periods') or []:
            if isinstance(item, dict) and item.get('condition') and item.get('months') is not None:
                PolicyWaitingPeriod.objects.create(
                    policy=policy, condition=item['condition'], months=item['months']
                )

        for item in result.get('sub_limits') or []:
            if isinstance(item, dict) and item.get('category') and item.get('limit'):
                PolicySubLimit.objects.create(
                    policy=policy, category=item['category'], limit_text=item['limit']
                )

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        """
        POST /api/insurance/{id}/confirm/ — the person reviews the AI-
        extracted details and explicitly confirms they're correct. This
        is the only thing that ever moves a policy to 'validated' — it's
        deliberately a manual step, not automatic, since AI extraction
        (even when it clearly worked, like a full exclusions list) can
        still contain a subtle error worth a human glance before it's
        treated as fully trusted data.
        """
        policy = self.get_object()
        policy.status = InsurancePolicy.Status.VALIDATED
        policy.save(update_fields=['status'])
        return Response(InsurancePolicySerializer(policy).data)

    @action(detail=True, methods=['get', 'post'], url_path='chat')
    def chat(self, request, pk=None):
        """
        GET  /api/insurance/{id}/chat/ — full chat history for this policy.
        POST /api/insurance/{id}/chat/ — insurance Q&A scoped to this policy.

        Combined into one action (rather than two separate @action methods
        that happened to share the same url_path) — that split was the
        actual cause of a real 405 found live: two different action
        methods declaring the same url_path is ambiguous for DRF's router
        to resolve reliably, and the GET path was losing. One action
        dispatching on request.method removes any doubt.
        """
        policy = self.get_object()
        if request.method == 'POST':
            serializer = AskInsuranceQuestionSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            question = serializer.validated_data['question']

            InsuranceChatMessage.objects.create(policy=policy, role='user', content=question)
            history = list(policy.chat_messages.values('role', 'content'))
            result = ClaudeService().answer_insurance_question(policy, question, history)
            ai_message = InsuranceChatMessage.objects.create(policy=policy, role='ai', content=result['answer'])

            return Response(InsuranceChatMessageSerializer(ai_message).data, status=status.HTTP_201_CREATED)

        return Response(InsuranceChatMessageSerializer(policy.chat_messages.all(), many=True).data)

    @action(detail=True, methods=['post'], url_path='estimate')
    def estimate(self, request, pk=None):
        """POST /api/insurance/{id}/estimate/ — deterministic calculation + AI phrasing."""
        policy = self.get_object()
        serializer = ClaimEstimateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        claim = estimate_claim(
            policy,
            serializer.validated_data['claim_category'],
            serializer.validated_data['estimated_bill'],
        )
        explanation = ClaudeService().explain_claim_estimate(ClaimEstimateSerializer(claim).data)
        claim.reasoning_summary = explanation
        claim.save(update_fields=['reasoning_summary'])

        return Response(ClaimEstimateSerializer(claim).data, status=status.HTTP_201_CREATED)


class ClaimEstimateViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ClaimEstimateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ClaimEstimate.objects.filter(policy__profile__account=self.request.user)
