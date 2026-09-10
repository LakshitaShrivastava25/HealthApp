from rest_framework import serializers

from .models import (
    ClaimEstimate, InsuranceChatMessage, InsurancePolicy,
    PolicyExclusion, PolicySubLimit, PolicyWaitingPeriod,
)


class PolicyExclusionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PolicyExclusion
        fields = ['id', 'description']


class PolicyWaitingPeriodSerializer(serializers.ModelSerializer):
    waiting_until = serializers.ReadOnlyField()

    class Meta:
        model = PolicyWaitingPeriod
        fields = ['id', 'condition', 'months', 'waiting_until']


class PolicySubLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = PolicySubLimit
        fields = ['id', 'category', 'limit_text']


class InsurancePolicySerializer(serializers.ModelSerializer):
    exclusions = PolicyExclusionSerializer(many=True, read_only=True)
    waiting_periods = PolicyWaitingPeriodSerializer(many=True, read_only=True)
    sub_limits = PolicySubLimitSerializer(many=True, read_only=True)

    class Meta:
        model = InsurancePolicy
        fields = [
            'id', 'profile', 'file', 'status', 'insurer', 'policy_number', 'plan_name',
            'policy_type', 'sum_insured', 'premium_amount', 'premium_due_date',
            'coverage_start', 'coverage_end',
            'room_rent_limit', 'co_payment_percent', 'structured_data',
            'exclusions', 'waiting_periods', 'sub_limits', 'uploaded_at',
        ]
        read_only_fields = ['id', 'status', 'structured_data', 'uploaded_at']


class ClaimEstimateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClaimEstimate
        fields = [
            'id', 'policy', 'claim_category', 'estimated_bill', 'eligible',
            'estimated_insurer_share', 'estimated_out_of_pocket',
            'reasoning_summary', 'created_at',
        ]
        read_only_fields = fields


class ClaimEstimateRequestSerializer(serializers.Serializer):
    claim_category = serializers.CharField(max_length=150)
    estimated_bill = serializers.DecimalField(max_digits=12, decimal_places=2)


class InsuranceChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsuranceChatMessage
        fields = ['id', 'policy', 'role', 'content', 'created_at']
        read_only_fields = ['id', 'created_at']


class AskInsuranceQuestionSerializer(serializers.Serializer):
    question = serializers.CharField()
