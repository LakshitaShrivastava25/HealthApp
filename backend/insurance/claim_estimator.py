"""
Deterministic claim-eligibility logic — per the TDD §6.6, exclusions/waiting
periods/limits are checked in plain backend code against structured data.
Claude is only ever called afterward to phrase the result in plain language
(see ClaudeService.explain_claim_estimate) — it never decides eligibility.
"""

from datetime import date
from decimal import Decimal

from .models import ClaimEstimate, InsurancePolicy


def estimate_claim(policy: InsurancePolicy, claim_category: str, estimated_bill: Decimal) -> ClaimEstimate:
    # 1. Exclusion check — immediate rejection, no further calculation needed.
    matching_exclusion = policy.exclusions.filter(description__icontains=claim_category).first()
    if matching_exclusion:
        return ClaimEstimate.objects.create(
            policy=policy,
            claim_category=claim_category,
            estimated_bill=estimated_bill,
            eligible=False,
            reasoning_summary=f"This appears to match an exclusion in your policy: \"{matching_exclusion.description}\".",
        )

    # 2. Waiting period check.
    for wp in policy.waiting_periods.all():
        if wp.condition.lower() in claim_category.lower():
            waiting_until = wp.waiting_until
            if waiting_until and waiting_until > date.today():
                return ClaimEstimate.objects.create(
                    policy=policy,
                    claim_category=claim_category,
                    estimated_bill=estimated_bill,
                    eligible=False,
                    reasoning_summary=(
                        f"A waiting period applies to \"{wp.condition}\" until {waiting_until.isoformat()}. "
                        f"This claim may not be eligible until that date."
                    ),
                )

    # 3. Sum insured + co-payment calculation.
    sum_insured = policy.sum_insured or Decimal('0')
    co_payment_percent = policy.co_payment_percent or Decimal('0')

    applicable_amount = min(estimated_bill, sum_insured) if sum_insured else estimated_bill
    co_payment_amount = applicable_amount * (co_payment_percent / Decimal('100'))
    insurer_share = applicable_amount - co_payment_amount
    out_of_pocket = estimated_bill - insurer_share

    return ClaimEstimate.objects.create(
        policy=policy,
        claim_category=claim_category,
        estimated_bill=estimated_bill,
        eligible=True,
        estimated_insurer_share=round(insurer_share, 2),
        estimated_out_of_pocket=round(out_of_pocket, 2),
        reasoning_summary=(
            f"Estimated insurer contribution: ₹{round(insurer_share, 2)}. "
            f"Estimated out-of-pocket: ₹{round(out_of_pocket, 2)}, based on "
            f"{co_payment_percent}% co-payment and your sum insured of ₹{sum_insured}."
        ),
    )
