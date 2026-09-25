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
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from django.utils.dateparse import parse_date

from .text_extraction import extract_text

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
    def _call(self, system_prompt: str, user_content: str, max_tokens: int = 1500) -> str:
        if not self.enabled:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not configured. Set it in .env to enable real Claude calls."
            )
        response = self.client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
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
        Text extraction → Claude structuring → Document.structured_data,
        mirroring analyze_insurance_policy + insurance's perform_create,
        which is the pattern in this codebase that already works.

        Returns the structured dict. Raises only for a genuine API/network
        failure — every *expected* problem (unreadable file, unparseable
        response) comes back as a marked result so the caller can record an
        honest state instead of a crash.
        """
        from documents.models import Document

        if not self.enabled:
            document.structured_data = self._mock_document_structuring(document.category)
            document.status = Document.Status.NEEDS_REVIEW
            document.save()
            return document.structured_data

        # Same extractor the insurance upload uses: real pypdf text for PDFs,
        # and an honest "OCR isn't configured" result for images rather than
        # silently returning nothing.
        extraction = extract_text(document.file)
        document.raw_ocr_text = extraction.text or ''

        if not extraction.succeeded:
            # Nothing to structure. Sending an empty string to Claude and
            # presenting the reply as a real reading would be worse than
            # saying plainly that the file could not be read.
            document.structured_data = {
                '_extraction_failed': True,
                'note': extraction.note or 'Could not extract any text from this file.',
            }
            document.status = Document.Status.NEEDS_REVIEW
            document.save()
            return document.structured_data

        system_prompt = open(
            __file__.replace('claude_service.py', 'prompts/document_structuring.txt'),
            encoding='utf-8',
        ).read()
        # 2000 rather than the 1500 default: a discharge summary can carry a
        # long medicines list plus diagnoses, and a response truncated
        # mid-JSON parses as nothing at all.
        raw_response = self._call(system_prompt, extraction.text, max_tokens=2000)

        try:
            result = self._parse_json(raw_response)
        except (json.JSONDecodeError, ValueError):
            # Identical handling to analyze_insurance_policy — a malformed
            # reply is a bad result, not a server error.
            document.structured_data = {
                '_extraction_failed': True,
                'note': (
                    "Claude's response could not be read as valid data. The document's text was "
                    "still saved — try processing it again, or fill the details in yourself."
                ),
            }
            document.status = Document.Status.NEEDS_REVIEW
            document.save()
            return document.structured_data

        if extraction.note:
            # Some pages had no readable text (a scanned page inside an
            # otherwise digital PDF), which is why fields can come back
            # empty even though the rest parsed fine.
            result['_extraction_warning'] = extraction.note

        document.structured_data = result
        self._apply_document_fields(document, result)
        # NEEDS_REVIEW, not PROCESSED — the same stance insurance takes: AI
        # extraction that clearly worked can still hold a subtle error, so a
        # person confirms it before it counts as final. Only the explicit
        # /confirm/ action moves a document to PROCESSED.
        document.status = Document.Status.NEEDS_REVIEW
        # processed_at records when the AI finished, which is still now.
        document.processed_at = timezone.now()
        document.save()
        return result

    @staticmethod
    def _apply_document_fields(document, result: dict):
        """
        Copy the extracted values onto the Document's own columns.

        structured_data alone is not enough: the Medical Locker list, the
        detail modal and the doctor's patient view all read title,
        category, doctor_name, hospital_name and document_date as real
        model fields. Without this the AI result would be invisible
        everywhere except the raw JSON panel.

        Only ever fills a blank field — a value the patient typed, or
        corrected via /correct/, is never overwritten by a later run.
        """
        from documents.models import Document

        if not isinstance(result, dict):
            return

        for field in ('title', 'doctor_name', 'hospital_name'):
            value = result.get(field)
            if value and not getattr(document, field):
                setattr(document, field, str(value)[:150 if field != 'title' else 255])

        category = result.get('category')
        valid = {c for c, _ in Document.Category.choices}
        # Only overwrite the category when the uploader left it at the
        # default; an explicit choice by the patient wins.
        if category in valid and document.category == Document.Category.OTHER:
            document.category = category

        if not document.document_date:
            parsed = parse_date(str(result.get('document_date') or ''))
            if parsed:
                document.document_date = parsed

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
        # 4000 tokens, not the default 1500 — a real, comprehensive policy
        # (a 60-page document with 30+ standard exclusions, several
        # waiting periods, and multiple sub-limits) can genuinely produce
        # a JSON response that size. The old default was sized for a
        # short response and would risk truncating mid-JSON for a real
        # large policy, which is exactly the "why doesn't it read a
        # 60-page PDF" question this was built to answer.
        raw_response = self._call(system_prompt, raw_text, max_tokens=4000)
        try:
            return self._parse_json(raw_response)
        except (json.JSONDecodeError, ValueError):
            # A genuinely truncated or malformed response should never
            # crash the whole upload with an unhandled 500 — report it
            # the same honest way as every other extraction problem, so
            # the person sees a clear reason instead of a broken page.
            return {
                '_extraction_failed': True,
                'note': (
                    "Claude's response could not be parsed as valid data — this can happen with an "
                    "unusually long or complex policy document. The extracted text was still saved; "
                    "try again, or add the policy details yourself."
                ),
            }

    def _mock_policy_structuring(self) -> dict:
        return {
            "_mock": True,
            "insurer": None,
            "policy_number": None,
            "policy_type": None,
            "sum_insured": None,
            "premium_amount": None,
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
            "the insurer. Cite the relevant clause/section where possible. Never invent coverage. "
            "Keep answers short — a few sentences, or a brief bulleted list for multiple points. "
            "Use markdown bullet points (lines starting with '-') for lists, and bold only the single "
            "most important fact (like the coverage decision itself), not entire sentences. "
            "No lengthy preamble — lead with the answer."
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
            f"KNOWN POLICY FIELDS:\n{json.dumps(known_facts, indent=2, cls=DjangoJSONEncoder)}\n\n"
            f"AI-EXTRACTED STRUCTURED DATA:\n{json.dumps(policy.structured_data, cls=DjangoJSONEncoder)}\n\n"
            f"RAW POLICY TEXT:\n{policy.raw_text[:40000] if policy.raw_text else '(none available)'}"
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
            "Keep it short — a few sentences, or a brief bulleted breakdown of the numbers. "
            "Bold only the key figures, not full sentences. No lengthy preamble. "
            "End by stating this is an estimate, not a guarantee of insurer approval."
        )
        return self._call(system_prompt, json.dumps(computed_result, cls=DjangoJSONEncoder))

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
            "You are a health information assistant. The PATIENT CONTEXT below includes this "
            "person's real blood group, allergies, active medications (with their actual reminder "
            "times), recent documents, and recent timeline events — use it directly to answer "
            "questions about their own medicines, schedule, or records. You may explain, summarize, "
            "and provide general information, but you must NEVER provide a definitive medical "
            "diagnosis or tell the user to change medication. Recommend professional consultation "
            "for anything diagnostic, urgent, or when in doubt. Ground every answer in the supplied "
            "context only — if something genuinely isn't in the context, say so plainly rather than "
            "guessing. "
            "Keep answers short — a few sentences, or a brief bulleted list for multiple points. "
            "Use markdown bullet points (lines starting with '-') for lists, and bold only the single "
            "most important word or phrase, not entire sentences. No lengthy preamble — lead with the answer."
        )
        user_content = f"PATIENT CONTEXT:\n{json.dumps(context, cls=DjangoJSONEncoder)}\n\nHISTORY:\n{history}\n\nQUESTION: {question}"
        answer = self._call(system_prompt, user_content)
        return {"answer": answer}
