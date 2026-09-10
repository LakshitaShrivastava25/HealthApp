"""
Deterministic claim-eligibility logic — per the TDD §6.6, exclusions/waiting
periods/limits are checked in plain backend code against structured data.
Claude is only ever called afterward to phrase the result in plain language
(see ClaudeService.explain_claim_estimate) — it never decides eligibility.
"""

import re
from datetime import date
from decimal import Decimal

from .models import ClaimEstimate, InsurancePolicy

# Common words that don't help decide whether two phrases mean the same
# thing (e.g. "or", "the") — excluded so they can't inflate a match.
_STOPWORDS = {'a', 'an', 'the', 'or', 'and', 'of', 'for', 'to', 'in', 'on', 'is', 'are'}


def _significant_words(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _phrase_matches(claim_category: str, policy_text: str, min_words: int = 1) -> bool:
    """
    True if every meaningful word in claim_category also appears in
    policy_text, regardless of word order or what else sits between them.

    Replaces a plain substring check (description__icontains=claim_category
    / condition in claim_category), which was found to silently miss real
    matches — "Cosmetic Surgery" is not a literal substring of "Cosmetic
    or Plastic Surgery (unless medically necessary)" because of the words
    in between, so a real exclusion was never being caught.

    min_words exists because the two callers have genuinely different
    risk profiles, found by testing this function against its own claims
    rather than trusting them: a single word like "Surgery" alone matched
    "Cosmetic or Plastic Surgery" and would over-match nearly any surgical
    exclusion — too consequential a mistake for a full-sentence exclusion
    description, so exclusion matching passes min_words=2. But applying
    that same floor to waiting periods broke a real, legitimate case: a
    condition like "Maternity" is often stored as a single specific
    medical term, not a vague word, and a naive 2-word minimum would make
    it unable to ever match anything (including itself). So waiting-period
    matching keeps the default of 1.
    """
    claim_words = _significant_words(claim_category)
    if len(claim_words) < min_words:
        return False
    return claim_words.issubset(_significant_words(policy_text))


def estimate_claim(policy: InsurancePolicy, claim_category: str, estimated_bill: Decimal) -> ClaimEstimate:
    # Coerced here rather than trusted from the caller — the HTTP path
    # already arrives as a real Decimal (ClaimEstimateRequestSerializer
    # handles that), but this function shouldn't silently assume every
    # caller does the same. A string slipping through would otherwise
    # crash later at `min(estimated_bill, sum_insured)` with a type
    # comparison error, found while reproducing an unrelated bug.
    if not isinstance(estimated_bill, Decimal):
        estimated_bill = Decimal(str(estimated_bill))

    # 1. Exclusion check — immediate rejection, no further calculation needed.
    matching_exclusion = None
    for excl in policy.exclusions.all():
        if _phrase_matches(claim_category, excl.description, min_words=2):
            matching_exclusion = excl
            break
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
        if _phrase_matches(claim_category, wp.condition) or _phrase_matches(wp.condition, claim_category):
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
