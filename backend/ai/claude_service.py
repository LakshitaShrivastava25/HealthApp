"""
Centralized Claude service layer. Per the TDD, ALL Claude API calls go
through here — never scattered directly into views. Every method returns
already-validated data or raises; callers never touch raw Claude output.

STATUS: ANTHROPIC_API_KEY is not yet set (see config/settings.py — reads
from .env). Until it's supplied, every method below returns a clearly
marked mock response with the correct shape, so the rest of the app
(documents, insurance) can be built and tested against a stable contract
today. Flip to real calls by setting ANTHROPIC_API_KEY — no other code
changes needed.
"""

import json
from datetime import date, timedelta

from django.conf import settings

try:
    import anthropic
except ImportError:
    anthropic = None


class ClaudeService:
    MODEL = "claude-sonnet-4-5"

    def __init__(self):
        self.api_key = settings.ANTHROPIC_API_KEY
        self.enabled = bool(self.api_key) and anthropic is not None
        if self.enabled:
            self.client = anthropic.Anthropic(api_key=self.api_key)

    # -- internal -----------------------------------------------------
    def _call(self, system_prompt: str, user_content: str) -> str:
        if not self.enabled:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not configured. Set it in .env to enable real Claude calls."
            )
        response = self.client.messages.create(
            model=self.MODEL,
            max_tokens=1500,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        return "".join(block.text for block in response.content if block.type == "text")

    def _parse_json(self, raw: str) -> dict:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(cleaned)

    # -- documents ------------------------------------------------------
    def process_document(self, document):
        """
        Stage 1 (OCR) → Stage 2 (Claude structuring) → validated JSON →
        Document.structured_data. OCR itself (Google Vision/AWS Textract)
        is not wired up yet — same reasoning as above, mocked until a
        provider key is supplied (OCR_PROVIDER_API_KEY in .env).
        """
        from documents.models import Document

        if not self.enabled:
            document.structured_data = self._mock_document_structuring(document.category)
            document.status = Document.Status.NEEDS_REVIEW
            document.save()
            return document.structured_data

        # Real pipeline once keys are set:
        # raw_text = ocr_extract(document.file)
        # system_prompt = PRESCRIPTION_STRUCTURING_PROMPT if document.category == 'prescription' else REPORT_STRUCTURING_PROMPT
        # result = self._parse_json(self._call(system_prompt, raw_text))
        # document.raw_ocr_text = raw_text
        # document.structured_data = result
        # document.status = Document.Status.PROCESSED
        # document.save()
        # return result
        raise NotImplementedError("Wire up OCR + real Claude call once API keys are set.")

    def _mock_document_structuring(self, category: str) -> dict:
        if category == 'prescription':
            return {
                "_mock": True,
                "doctor_name": None,
                "hospital_name": None,
                "date": None,
                "diagnosis": [],
                "medicines": [],
                "tests": [],
                "follow_up_date": None,
                "note": "Mock structuring — set ANTHROPIC_API_KEY to enable real OCR+Claude extraction.",
            }
        return {
            "_mock": True,
            "summary": None,
            "key_values": [],
            "note": "Mock structuring — set ANTHROPIC_API_KEY to enable real OCR+Claude extraction.",
        }

    # -- insurance ------------------------------------------------------
    def analyze_insurance_policy(self, policy):
        """Structures a policy PDF's extracted text into the schema in prompts/insurance_structuring.txt."""
        if not self.enabled:
            return self._mock_policy_structuring()

        raw_text = policy.raw_text
        system_prompt = open(
            __file__.replace('claude_service.py', 'prompts/insurance_structuring.txt')
        ).read()
        result = self._parse_json(self._call(system_prompt, raw_text))
        return result

    def _mock_policy_structuring(self) -> dict:
        return {
            "_mock": True,
            "insurer": None,
            "policy_number": None,
            "policy_type": None,
            "sum_insured": None,
            "coverage_start": None,
            "coverage_end": None,
            "room_rent_limit": None,
            "co_payment_percent": None,
            "waiting_periods": [],
            "exclusions": [],
            "sub_limits": [],
            "network_hospitals_note": None,
            "note": "Mock structuring — set ANTHROPIC_API_KEY to enable real policy extraction.",
        }

    def answer_insurance_question(self, policy, question: str, history: list):
        """
        Insurance Chat — grounded in this policy's full known data: the
        structured fields (insurer, sum insured, dates), the normalized
        exclusions/waiting-periods/sub-limits tables, plus structured_data
        and raw_text where available. Earlier versions only passed
        structured_data + raw_text, which left this blank for policies
        whose exclusions/limits were entered directly rather than through
        AI extraction — this pulls in everything the app actually knows.
        """
        if not self.enabled:
            return {
                "answer": (
                    "AI insurance chat is not yet connected to a live Claude API key. "
                    "Once ANTHROPIC_API_KEY is set, this will answer strictly from your "
                    "uploaded policy and cite the relevant clause."
                ),
                "_mock": True,
            }
        system_prompt = (
            "You are an insurance assistant. Answer ONLY using the policy content supplied. "
            "If the answer isn't in the document, say so explicitly and recommend contacting "
            "the insurer. Cite the relevant clause/section where possible. Never invent coverage."
        )
        known_facts = {
            "insurer": policy.insurer,
            "policy_number": policy.policy_number,
            "plan_name": policy.plan_name,
            "sum_insured": str(policy.sum_insured) if policy.sum_insured else None,
            "coverage_start": str(policy.coverage_start) if policy.coverage_start else None,
            "coverage_end": str(policy.coverage_end) if policy.coverage_end else None,
            "room_rent_limit": policy.room_rent_limit,
            "co_payment_percent": str(policy.co_payment_percent) if policy.co_payment_percent else None,
            "exclusions": [e.description for e in policy.exclusions.all()],
            "waiting_periods": [
                {"condition": wp.condition, "months": wp.months, "covered_from": str(wp.waiting_until)}
                for wp in policy.waiting_periods.all()
            ],
            "sub_limits": [{"category": sl.category, "limit": sl.limit_text} for sl in policy.sub_limits.all()],
        }
        context = (
            f"KNOWN POLICY FIELDS:\n{json.dumps(known_facts, indent=2)}\n\n"
            f"AI-EXTRACTED STRUCTURED DATA:\n{json.dumps(policy.structured_data)}\n\n"
            f"RAW POLICY TEXT:\n{policy.raw_text[:8000] if policy.raw_text else '(none available)'}"
        )
        user_content = f"{context}\n\nCONVERSATION SO FAR:\n{history}\n\nQUESTION: {question}"
        answer = self._call(system_prompt, user_content)
        return {"answer": answer}

    # -- claim estimator ------------------------------------------------
    def explain_claim_estimate(self, computed_result: dict) -> str:
        """
        Per the TDD: eligibility/amounts are computed deterministically in
        insurance/claim_estimator.py — Claude is called ONLY to phrase the
        result in plain language, never to decide eligibility itself.
        """
        deterministic_reasoning = computed_result.get('reasoning_summary', '')

        if not self.enabled:
            # Keep the deterministic reasoning (already accurate and specific)
            # and just note that AI phrasing isn't live yet, rather than
            # replacing it with a generic placeholder that loses information.
            return (
                f"{deterministic_reasoning} "
                f"(This explanation will be rewritten in friendlier plain language "
                f"once ANTHROPIC_API_KEY is set — the underlying numbers above are "
                f"already the real, deterministically-computed estimate.)"
            ).strip()

        system_prompt = (
            "Explain this already-computed insurance claim estimate in plain, reassuring "
            "language for a layperson. Do not change or re-derive any numbers — only explain them. "
            "End by stating this is an estimate, not a guarantee of insurer approval."
        )
        return self._call(system_prompt, json.dumps(computed_result))

    # -- health chat ------------------------------------------------------
    def answer_health_question(self, profile, question: str, context: dict, history: list):
        """
        AI Health Chat — grounded only in the given profile's own records.
        Must never state a diagnosis or medication change as fact.
        """
        if not self.enabled:
            return {
                "answer": (
                    "The AI health assistant isn't connected to a live Claude API key yet. "
                    "Once configured, this will answer using your own timeline and records, "
                    "and will always recommend professional consultation for anything urgent."
                ),
                "_mock": True,
            }
        system_prompt = (
            "You are a health information assistant. You may explain, summarize, and provide "
            "general information, but you must NEVER provide a definitive medical diagnosis or "
            "tell the user to change medication. Recommend professional consultation for anything "
            "diagnostic, urgent, or when in doubt. Ground every answer in the supplied context only."
        )
        user_content = f"PATIENT CONTEXT:\n{json.dumps(context)}\n\nHISTORY:\n{history}\n\nQUESTION: {question}"
        answer = self._call(system_prompt, user_content)
        return {"answer": answer}
