from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ai.claude_service import ClaudeService
from .claim_estimator import estimate_claim
from .models import ClaimEstimate, InsuranceChatMessage, InsurancePolicy
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
        # TODO: extract text (PyMuPDF for digital PDFs, OCR fallback for scans)
        # before structuring — see ai/claude_service.py for the Claude step.
        result = ClaudeService().analyze_insurance_policy(policy)
        policy.structured_data = result
        policy.status = InsurancePolicy.Status.NEEDS_REVIEW
        policy.save()

    @action(detail=True, methods=['post'], url_path='chat')
    def chat(self, request, pk=None):
        """POST /api/insurance/{id}/chat/ — insurance Q&A scoped to this policy."""
        policy = self.get_object()
        serializer = AskInsuranceQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.validated_data['question']

        InsuranceChatMessage.objects.create(policy=policy, role='user', content=question)
        history = list(policy.chat_messages.values('role', 'content'))
        result = ClaudeService().answer_insurance_question(policy, question, history)
        ai_message = InsuranceChatMessage.objects.create(policy=policy, role='ai', content=result['answer'])

        return Response(InsuranceChatMessageSerializer(ai_message).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='chat')
    def chat_history(self, request, pk=None):
        policy = self.get_object()
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
