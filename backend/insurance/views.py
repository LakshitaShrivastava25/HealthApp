from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from config.throttling import ActionThrottleMixin
from family.permissions import assert_owns_profile, profile_id_param
from .claim_estimator import estimate_claim
from .models import ClaimEstimate, InsuranceChatMessage, InsurancePolicy
from .processing import STILL_READING, expire_stale_processing, start_policy_analysis
from .serializers import (
    AskInsuranceQuestionSerializer, ClaimEstimateRequestSerializer, ClaimEstimateSerializer,
    InsuranceChatMessageSerializer, InsurancePolicySerializer,
)


# Messages of earlier conversation sent along with each new question.
CHAT_HISTORY_LIMIT = 20


class InsurancePolicyViewSet(ActionThrottleMixin, viewsets.ModelViewSet):
    serializer_class = InsurancePolicySerializer
    permission_classes = [IsAuthenticated]
    action_throttle_scopes = {
        'create': 'uploads', 'chat': 'ai', 'estimate': 'ai', 'retry_processing': 'ai',
    }

    def get_queryset(self):
        qs = InsurancePolicy.objects.filter(profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs

    def perform_update(self, serializer):
        # Without this a PATCH could move one's own policy onto anyone else's
        # profile (its id is the patient reference code doctors are given).
        if 'profile' in serializer.validated_data:
            assert_owns_profile(self.request.user, serializer.validated_data['profile'])
        # The background read overwrites these fields when it finishes, so an
        # edit made meanwhile would be silently lost.
        if serializer.instance.status == InsurancePolicy.Status.PROCESSING:
            raise ValidationError({'detail': STILL_READING})
        serializer.save()

    def list(self, request, *args, **kwargs):
        expire_stale_processing(self.get_queryset())
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        expire_stale_processing(self.get_queryset())
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        """
        POST /api/insurance/ — store the policy and answer at once.

        Reading a policy (text extraction plus an AI call that can produce
        4000 tokens for a long one) used to happen before this answered,
        which routinely outlasted Gunicorn's worker timeout and nginx's read
        timeout: the person saw "Upload failed" while the policy sat in
        "processing" forever. Now it lands as PROCESSING and is read in the
        background, exactly like a locker document; the apps refresh until
        the status moves on.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assert_owns_profile(request.user, serializer.validated_data.get('profile'))
        policy = serializer.save(
            status=InsurancePolicy.Status.PROCESSING,
            processing_started_at=timezone.now(),
        )
        start_policy_analysis(policy.pk)
        data = self.get_serializer(InsurancePolicy.objects.get(pk=policy.pk)).data
        return Response(data, status=status.HTTP_201_CREATED, headers=self.get_success_headers(data))

    @action(detail=True, methods=['post'], url_path='retry-processing')
    def retry_processing(self, request, pk=None):
        """
        POST /api/insurance/{id}/retry-processing/ — read a stored policy
        again, after a failure or an interrupted read. The file is already
        here, so nothing needs uploading twice.
        """
        policy = self.get_object()
        expire_stale_processing(self.get_queryset().filter(pk=policy.pk))
        policy.refresh_from_db()
        if policy.status == InsurancePolicy.Status.PROCESSING:
            return Response(
                {'detail': 'This policy is already being read.'}, status=status.HTTP_409_CONFLICT
            )
        policy.status = InsurancePolicy.Status.PROCESSING
        policy.processing_started_at = timezone.now()
        policy.structured_data = {}
        policy.save(update_fields=['status', 'processing_started_at', 'structured_data'])
        start_policy_analysis(policy.pk)
        return Response(self.get_serializer(InsurancePolicy.objects.get(pk=policy.pk)).data)

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
        if policy.status == InsurancePolicy.Status.PROCESSING:
            # Confirming now would mark an empty policy verified, and the
            # background read would then knock it back to needs_review.
            return Response({'detail': STILL_READING}, status=status.HTTP_409_CONFLICT)
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
            # The recent conversation only: re-sending the whole history made
            # every question cost more than the last, without end.
            recent = policy.chat_messages.order_by('-created_at', '-id').values('role', 'content')[:CHAT_HISTORY_LIMIT]
            history = list(reversed(list(recent)))
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
