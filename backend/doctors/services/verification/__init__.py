"""
Checks a doctor's registration against the National Medical Commission's
Indian Medical Register and records what it found — for an admin.

The check never approves or rejects anyone. Whatever the register says (a
match, a name mismatch, not found, removed from the register, or that it
couldn't be reached), the doctor waits in the admin queue and an admin
decides, with the register's answer in front of them. A registration number
and a name are public, so a match alone proves nothing about who holds the
account — and two sources failing to find a number can still be a typo.

Providers are tried in the order DOCTOR_VERIFY_PROVIDERS gives (default
nmc, apify, decentro), skipping any that aren't configured:

  nmc       NMC's own register (nmc_provider.py). Free, usually ~2 s.
  apify     A hosted NMC lookup run from Apify's servers (apify_provider.py).
  decentro  Decentro's NMC verification API (decentro_provider.py).

The chain stops at the first provider that finds the number (or finds it
several times over); "not found" and "unreachable" move on to the next.
While a person waits — sign-up, the form's Verify button, an admin's
Re-verify — only the FAST providers are asked; the outside fallbacks are
slower and paid, and run from `manage.py reverify_doctors`. They are only
ever asked about doctors who consented to outside verification partners.
"""

import logging
import re
import time

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from ...councils import council_name
from ...models import Doctor
from .apify_provider import ApifyProvider
from .base import AMBIGUOUS, FOUND, NOT_FOUND, UNAVAILABLE, Lookup, VerificationResult
from .decentro_provider import DecentroProvider
from .names import compute_name_match
from .nmc_provider import NMCProvider
from .parsers import comparable, strip_pii

logger = logging.getLogger(__name__)

CACHE_SECONDS = 7 * 24 * 3600

PROVIDERS = {cls.name: cls for cls in (NMCProvider, ApifyProvider, DecentroProvider)}
# Asked while someone waits on the answer.
FAST = ('nmc',)
# Every configured provider, in DOCTOR_VERIFY_PROVIDERS order.
FULL = None

__all__ = [
    'AMBIGUOUS', 'FAST', 'FOUND', 'FULL', 'NOT_FOUND', 'UNAVAILABLE', 'VerificationResult',
    'apply_verification', 'compute_name_match', 'form_prefill', 'provider_chain', 'verify_registration',
]


def provider_chain(only=FULL) -> list:
    """The configured providers, in order; `only` narrows them (e.g. FAST)."""
    chain = []
    for name in settings.DOCTOR_VERIFY_PROVIDERS:
        cls = PROVIDERS.get(name)
        if cls is None:
            logger.warning('Ignoring unknown doctor verification provider %r', name)
            continue
        if only is not None and name not in only:
            continue
        provider = cls()
        if provider.configured:
            chain.append(provider)
    return chain


def _skip_reason(provider, q: Lookup) -> str:
    if provider.third_party and not q.consent:
        return 'no consent to outside verification'
    return provider.skip_reason(q)


def _cache_key(q: Lookup, chain) -> str:
    # The answer depends on which providers could run, and on the year (it
    # picks between entries that share a number).
    runnable = '+'.join(p.name for p in chain if not _skip_reason(p, q))
    return f'doctor-verify:v2:{q.council}:{comparable(q.reg_no)}:{q.year or ""}:{runnable}'


def verify_registration(reg_no, council_id, year=None, *, name='', reference='', consent=False,
                        providers=FAST, attempts=3, use_cache=True) -> VerificationResult:
    """
    Look a registration up through the provider chain. Found / not-found
    answers are cached for 7 days (the register changes slowly, and NMC is
    slow); an unreachable register is never cached, so the next try asks again.
    """
    q = Lookup(reg_no=reg_no, council=council_id, year=year, name=name, reference=reference, consent=consent)
    chain = provider_chain(providers)
    key = _cache_key(q, chain)
    if use_cache:
        cached = cache.get(key)
        if cached:
            return VerificationResult.from_cache(cached)

    result = _run_chain(q, chain, attempts)
    if result.status in (FOUND, NOT_FOUND):
        cache.set(key, result.to_cache(), CACHE_SECONDS)
    return result


def _run_chain(q: Lookup, chain, attempts) -> VerificationResult:
    log, outcomes = [], []
    for provider in chain:
        reason = _skip_reason(provider, q)
        if reason:
            log.append({'provider': provider.name, 'result': 'skipped', 'reason': reason})
            continue
        started = time.monotonic()
        try:
            result = provider.verify(q, attempts=attempts)
        except Exception:  # one provider's bug must not stop the others
            logger.exception('%s verification crashed for reg %s (%s)', provider.name, q.reg_no, q.council)
            result = VerificationResult(status=UNAVAILABLE, provider=provider.name, error=f'{provider.name}: internal error')
        entry = {
            'provider': provider.name,
            'result': 'suspended' if result.status == FOUND and result.is_suspended else result.status,
            'ms': round((time.monotonic() - started) * 1000),
        }
        if result.error:
            entry['error'] = result.error[:300]
        log.append(entry)
        outcomes.append(result)
        if result.status in (FOUND, AMBIGUOUS):
            break

    answered = [r for r in outcomes if r.status in (FOUND, AMBIGUOUS)]
    not_found = [r for r in outcomes if r.status == NOT_FOUND]
    if answered:
        result = answered[0]
    elif not_found:
        # The first "not found" (NMC's, when it answered) carries the
        # other-councils hint; the log says who else agreed.
        result = not_found[0]
    elif outcomes:
        result = outcomes[-1]
        result.error = '; '.join(r.error for r in outcomes if r.error) or result.error
    else:
        result = VerificationResult(
            status=UNAVAILABLE, provider='', error='No verification provider could check this registration.',
        )
    result.attempts = log
    return result


def form_prefill(result: VerificationResult) -> dict:
    """
    A register match shaped for the registration form to fill in: the name as
    a person writes it, every degree on record, and the year of registration
    (with the years since, as an experience estimate). Only what the register
    holds about the registration itself — its personal fields were scrubbed
    before the result got here. Empty unless exactly one entry matched.
    """
    if result.status != FOUND:
        return {}
    prefill = {}

    name = re.sub(r'^dr(\.\s*|\s+)', '', ' '.join(result.name.split()), flags=re.IGNORECASE)
    if name:
        # The register stores names in capitals ("ASHA KRISHNA RAO").
        prefill['full_name'] = (name.title() if name.isupper() else name)[:150]

    raw = result.raw or {}
    extra = raw.get('additional_qualifications')
    degrees, seen = [], set()
    for degree in [raw.get('qualification')] + [q.get('qualification') for q in extra or [] if isinstance(q, dict)]:
        text = ' '.join(str(degree or '').split())
        if text and text.upper() not in seen:
            seen.add(text.upper())
            degrees.append(text)
    qualification = ', '.join(degrees) or result.qualification
    if qualification:
        prefill['qualification'] = qualification[:255]

    year = result.registration_year or (result.registration_date.year if result.registration_date else None)
    this_year = timezone.localdate().year
    if year and 1900 < year <= this_year:
        prefill['registration_year'] = year
        prefill['experience_years'] = this_year - year
    return prefill


def other_councils_text(result: VerificationResult) -> str:
    """'Tamil Nadu Medical Council (2015) and Karnataka Medical Council (2015)', or ''."""
    names = []
    for entry in result.other_councils:
        name = entry.get('council_name') or council_name(entry.get('council'))
        label = f'{name} ({entry["year"]})' if entry.get('year') else name
        if label not in names:
            names.append(label)
    if len(names) > 1:
        return ', '.join(names[:-1]) + ' and ' + names[-1]
    return names[0] if names else ''


def _remarks_for(result: VerificationResult, doctor: Doctor) -> str:
    if result.status == FOUND:
        return result.suspension_remarks
    if result.status == NOT_FOUND:
        sources = [
            PROVIDERS[a['provider']].label for a in result.attempts
            if a.get('result') == NOT_FOUND and a.get('provider') in PROVIDERS
        ] or [PROVIDERS[result.provider].label if result.provider in PROVIDERS else 'the register']
        remarks = (
            f'No registration {doctor.registration_number} found in '
            f'{council_name(doctor.state_council_id)} (checked: {", ".join(sources)}).'
        )
        elsewhere = other_councils_text(result)
        if elsewhere:
            remarks += f' The same number is listed under {elsewhere} — the doctor may have picked the wrong council.'
        return remarks
    if result.status == AMBIGUOUS:
        return result.error
    return ''


def apply_verification(doctor: Doctor, *, providers=FAST, attempts=3, use_cache=True) -> Doctor:
    """
    Check `doctor` against the register, record the answer on the record and
    put the registration in front of an admin. Never raises for a provider
    problem and never decides: VERIFIED and REJECTED are an admin's to set.

    A doctor an admin already verified keeps that status, with one
    exception: if the register now lists them as removed, they go back to
    the admin queue and their patient access pauses until an admin decides.
    """
    S = Doctor.VerificationStatus
    awaiting = doctor.verification_status in Doctor.AWAITING_ADMIN

    if not (doctor.registration_number and doctor.state_council_id):
        # Older app versions don't send a council; nothing to look up.
        doctor.last_verification_error = 'No registration number and medical council to check.'
        if awaiting:
            doctor.verification_status = S.MANUAL_REVIEW
        doctor.save()
        return doctor

    result = verify_registration(
        doctor.registration_number, doctor.state_council_id, doctor.registration_year,
        name=doctor.full_name, reference=str(doctor.pk), consent=doctor.verification_consent_at is not None,
        providers=providers, attempts=attempts, use_cache=use_cache,
    )
    doctor.verification_attempts += 1
    doctor.verification_provider = result.provider
    doctor.provider_attempts = result.attempts
    doctor.nmc_result = result.status
    doctor.nmc_checked_at = timezone.now()

    if result.status == UNAVAILABLE:
        # Keep whatever the last successful check found; just say why this
        # one didn't happen. Not a judgement on the doctor.
        doctor.last_verification_error = result.error or 'The medical register could not be reached.'
        if awaiting:
            doctor.verification_status = S.FAILED
        doctor.save()
        return doctor

    doctor.last_verification_error = ''
    payload = result.raw
    if result.status == NOT_FOUND and result.other_councils:
        payload = {**(payload or {}), 'other_councils': result.other_councils}
    doctor.nmc_payload = strip_pii(payload)
    doctor.nmc_suspended = result.status == FOUND and result.is_suspended
    doctor.nmc_remarks = _remarks_for(result, doctor)[:500]
    if result.status == FOUND:
        doctor.nmc_doctor_id = result.nmc_doctor_id
        doctor.nmc_name = result.name[:255]
        doctor.nmc_qualification = result.qualification[:255]
        doctor.nmc_university = result.university[:255]
        doctor.nmc_registration_date = result.registration_date
        doctor.name_match_score = round(compute_name_match(doctor.full_name, result.name), 3)
    else:
        doctor.nmc_doctor_id = doctor.nmc_name = doctor.nmc_qualification = doctor.nmc_university = ''
        doctor.nmc_registration_date = None
        doctor.name_match_score = None

    if awaiting:
        doctor.verification_status = S.MANUAL_REVIEW
    elif doctor.verification_status == S.VERIFIED and doctor.nmc_suspended:
        doctor.verification_status = S.MANUAL_REVIEW
        logger.warning('Verified doctor %s is listed as removed on the NMC register; back to admin review', doctor.pk)
    doctor.save()
    return doctor


def name_matches(doctor: Doctor) -> bool:
    """Whether the stored match score clears DOCTOR_NAME_MATCH_THRESHOLD."""
    return doctor.name_match_score is not None and doctor.name_match_score >= settings.DOCTOR_NAME_MATCH_THRESHOLD
