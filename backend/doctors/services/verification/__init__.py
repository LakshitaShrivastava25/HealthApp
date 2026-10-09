"""
Checks a doctor's registration against the National Medical Commission's
Indian Medical Register and records what it found — for an admin.

The check never approves or rejects anyone. Whatever the register says (a
match, a name mismatch, not found, removed from the register, or that it
couldn't be reached), the doctor waits in the admin queue and an admin
decides, with the register's answer in front of them. A registration number
and a name are public, so a match alone proves nothing about who holds the
account.

Providers are swappable: NMC's own register by default, and an optional paid
vendor (vendor_provider.py) tried only when NMC is unreachable.
"""

import logging

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from ...councils import council_name
from ...models import Doctor
from .base import AMBIGUOUS, FOUND, NOT_FOUND, UNAVAILABLE, VerificationResult
from .names import compute_name_match
from .nmc_provider import NMCProvider, comparable
from .vendor_provider import VendorProvider

logger = logging.getLogger(__name__)

CACHE_SECONDS = 7 * 24 * 3600

__all__ = [
    'AMBIGUOUS', 'FOUND', 'NOT_FOUND', 'UNAVAILABLE', 'VerificationResult',
    'apply_verification', 'compute_name_match', 'verify_registration',
]


def _cache_key(reg_no, council):
    return f'doctor-verify:v1:{council}:{comparable(reg_no)}'


def verify_registration(reg_no, council_id, year=None, *, attempts=3, use_cache=True) -> VerificationResult:
    """
    Look a registration up. Found / not-found answers are cached for 7 days
    (the register changes slowly, and NMC is slow); an unreachable register
    is never cached, so the next try asks again.
    """
    key = _cache_key(reg_no, council_id)
    if use_cache:
        cached = cache.get(key)
        if cached:
            return VerificationResult.from_cache(cached)

    result = NMCProvider().verify(reg_no, council_id, year, attempts=attempts)
    if result.status == UNAVAILABLE:
        vendor = VendorProvider()
        if vendor.configured:
            result = vendor.verify(reg_no, council_id, year)

    if result.status in (FOUND, NOT_FOUND):
        cache.set(key, result.to_cache(), CACHE_SECONDS)
    return result


def _remarks_for(result: VerificationResult, doctor: Doctor) -> str:
    if result.status == FOUND:
        return result.suspension_remarks
    if result.status == NOT_FOUND:
        return (
            f'No registration {doctor.registration_number} found in '
            f'{council_name(doctor.state_council_id)} on the NMC register.'
        )
    if result.status == AMBIGUOUS:
        return result.error
    return ''


def apply_verification(doctor: Doctor, *, attempts=3, use_cache=True) -> Doctor:
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
        attempts=attempts, use_cache=use_cache,
    )
    doctor.verification_attempts += 1
    doctor.verification_provider = result.provider
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
    doctor.nmc_payload = result.raw
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
