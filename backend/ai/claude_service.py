"""
Centralized Claude service layer. Per the TDD, ALL Claude API calls go
through here — never scattered directly into views. Every method returns
already-validated data or raises; callers never touch raw Claude output.

Three states, all of them normal, none of them fatal:

  * No ANTHROPIC_API_KEY — every method returns a clearly marked mock with
    the correct shape, so the rest of the app works against a stable
    contract without a key.
  * A working key — real extraction and real answers.
  * A key that is present but does not work (revoked, mistyped, rate
    limited, or the service is down) — `enabled` only checks that the key
    is non-empty, so this is indistinguishable from a good key until the
    request comes back. Every such failure is caught in `_call` and raised
    as ClaudeUnavailable, which callers turn into a saved record flagged
    'needs review' with a readable reason. It must never reach the user as
    a 500 on an upload they had every reason to expect to succeed.

Text extraction itself (pypdf for PDFs) is real and runs regardless of
whether a key is configured — see text_extraction.py.
"""

import json
from datetime import date, timedelta
from pathlib import Path

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

from .text_extraction import extract_text

try:
    import anthropic
except ImportError:
    anthropic = None


def _parse_iso_date(value):
    """
    A YYYY-MM-DD string from an AI response, or None.

    Never raises: the model is instructed to return this shape but is not
    bound to, and one malformed date must not fail an entire upload.
    """
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


class ClaudeUnavailable(Exception):
    """
    A Claude call could not complete.

    Carries a reason written for the person who uploaded the file, not a
    stack trace. Every caller in this module turns one of these into a
    "needs review" record with the reason attached, so a bad key, an
    outage or a rate limit degrades the feature instead of returning a
    500 from an upload the user has every reason to expect to succeed.
    """

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class ClaudeService:
    MODEL = "claude-sonnet-4-5"

    def __init__(self):
        self.api_key = settings.ANTHROPIC_API_KEY
        self.enabled = bool(self.api_key) and anthropic is not None
        if self.enabled:
            self.client = anthropic.Anthropic(api_key=self.api_key)

    # -- internal -----------------------------------------------------
    def _call(self, system_prompt: str, user_content: str, max_tokens: int = 1500) -> str:
        """
        The single place a Claude request is made, and therefore the single
        place its failures are translated.

        `enabled` is only a check that a key is non-empty — it cannot tell
        whether that key actually works. An invalid or revoked key looks
        exactly like a valid one until the request comes back 401, which is
        why every one of these errors is caught here rather than trusted to
        never happen: before this, a wrong key in .env turned every
        document and policy upload into a 500.
        """
        if not self.enabled:
            raise ClaudeUnavailable(
                "AI processing is not configured — ANTHROPIC_API_KEY is unset."
            )
        try:
            response = self.client.messages.create(
                model=self.MODEL,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}],
            )
        except anthropic.AuthenticationError:
            raise ClaudeUnavailable(
                "The AI service rejected the configured API key. An administrator needs "
                "to check ANTHROPIC_API_KEY."
            )
        except anthropic.RateLimitError:
            raise ClaudeUnavailable(
                "The AI service is temporarily rate-limited. Please try again in a few minutes."
            )
        except anthropic.APIConnectionError:
            raise ClaudeUnavailable(
                "The AI service could not be reached right now."
            )
        except anthropic.APIStatusError as exc:
            raise ClaudeUnavailable(
                f"The AI service returned an error (HTTP {exc.status_code})."
            )
        return "".join(block.text for block in response.content if block.type == "text")

    def _structure(self, prompt_filename: str, raw_text: str, max_tokens: int = 3000) -> dict:
        """
        Runs one extraction prompt and returns parsed JSON, or a dict
        flagged `_extraction_failed` with a readable reason. Callers store
        that dict as-is and mark the record 'needs review'.
        """
        system_prompt = (Path(__file__).parent / 'prompts' / prompt_filename).read_text(encoding='utf-8')
        try:
            raw = self._call(system_prompt, raw_text, max_tokens=max_tokens)
        except ClaudeUnavailable as exc:
            # The reason is deliberately context-free (the same exception
            # serves chat), so the file-specific half is added here.
            return {
                '_extraction_failed': True,
                'note': (
                    f'{exc.reason} Your file was saved, but its details could not be read '
                    f'automatically — add them yourself, or try again once this is resolved.'
                ),
            }
        try:
            return self._parse_json(raw)
        except (json.JSONDecodeError, ValueError):
            return {
                '_extraction_failed': True,
                'note': (
                    "The AI response could not be read as valid data — this can happen with an "
                    "unusually long or unusual document. The extracted text was still saved; "
                    "try again, or add the details yourself."
                ),
            }

    def _parse_json(self, raw: str) -> dict:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(cleaned)

    # -- documents ------------------------------------------------------
    def process_document(self, document):
        """
        Text extraction → Claude structuring → Document.structured_data,
        then the Timeline and Medication rows derived from it.

        Mirrors the insurance path, which already worked this way. Every
        outcome — no readable text, no API key, a rejected key, unparseable
        output — lands the document in 'needs review' with a readable note
        rather than raising. A failed upload used to mean a 500; now it
        means a saved document the person can complete by hand.

        Status is deliberately NEEDS_REVIEW even on full success: extracted
        medical details are not treated as verified until a human confirms
        them, the same rule the insurance flow follows.
        """
        from documents.models import Document
        from documents.derived import rebuild_derived_records

        extraction = extract_text(document.file)
        document.raw_ocr_text = extraction.text or ''

        if not extraction.succeeded:
            document.structured_data = {
                '_extraction_failed': True,
                'note': extraction.note or 'Could not extract any text from this file.',
            }
            document.status = Document.Status.NEEDS_REVIEW
            document.processed_at = timezone.now()
            document.save()
            # Still worth a timeline entry — the document itself is a real
            # health event even when nothing could be read out of it.
            rebuild_derived_records(document)
            return document.structured_data

        if not self.enabled:
            result = self._mock_document_structuring(document.category)
        else:
            prompt = (
                'prescription_structuring.txt'
                if document.category == Document.Category.PRESCRIPTION
                else 'report_structuring.txt'
            )
            result = self._structure(prompt, extraction.text)

        if extraction.note:
            # Extraction partly succeeded — some pages had no readable text.
            # Explains why fields can be missing from an otherwise fine file.
            result['_extraction_warning'] = extraction.note

        if not (result.get('_mock') or result.get('_extraction_failed')):
            # Copy what was read into the columns the app actually displays.
            # Without this the structured data sits unused while the document
            # header stays blank — the same bug the insurance flow already hit.
            document.doctor_name = (result.get('doctor_name') or document.doctor_name or '')[:150]
            document.hospital_name = (result.get('hospital_name') or document.hospital_name or '')[:150]
            parsed_date = _parse_iso_date(result.get('date'))
            if parsed_date:
                document.document_date = parsed_date

        document.structured_data = result
        document.status = Document.Status.NEEDS_REVIEW
        document.processed_at = timezone.now()
        document.save()
        rebuild_derived_records(document)
        return result

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

        # 4000 tokens, not the default 1500 — a real, comprehensive policy
        # (a 60-page document with 30+ standard exclusions, several
        # waiting periods, and multiple sub-limits) can genuinely produce
        # a JSON response that size. The old default was sized for a
        # short response and would risk truncating mid-JSON for a real
        # large policy, which is exactly the "why doesn't it read a
        # 60-page PDF" question this was built to answer.
        #
        # _structure handles both failure modes — an unusable API key and
        # an unparseable response — as a flagged dict rather than an
        # exception. A rejected key used to surface here as a 500 on
        # upload; the policy is saved either way and simply needs review.
        return self._structure('insurance_structuring.txt', policy.raw_text, max_tokens=4000)

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
        try:
            answer = self._call(system_prompt, user_content)
        except ClaudeUnavailable as exc:
            # The caller has already persisted the question as a chat
            # message, so an outage has to answer in the thread. Raising
            # would leave the person looking at their own question with no
            # reply and nothing explaining why.
            return {"answer": exc.reason, "_unavailable": True}
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
        try:
            return self._call(system_prompt, json.dumps(computed_result, cls=DjangoJSONEncoder))
        except ClaudeUnavailable:
            # Eligibility and every number come from claim_estimator.py, not
            # from Claude — only the friendlier phrasing is missing. Return
            # the deterministic reasoning rather than failing an estimate
            # that was already fully and correctly computed.
            return deterministic_reasoning

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
        try:
            answer = self._call(system_prompt, user_content)
        except ClaudeUnavailable as exc:
            return {"answer": exc.reason, "_unavailable": True}
        return {"answer": answer}
