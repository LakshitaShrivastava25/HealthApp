import hashlib
import random
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import OTPRequest

OTP_TTL_MINUTES = 5
OTP_RATE_LIMIT_PER_HOUR = 5


def _hash_otp(otp: str, phone_number: str) -> str:
    return hashlib.sha256(f"{otp}:{phone_number}:{settings.SECRET_KEY}".encode()).hexdigest()


def request_otp(phone_number: str) -> dict:
    """
    Generates and stores a hashed OTP. Rate-limits to OTP_RATE_LIMIT_PER_HOUR
    per phone number to prevent SMS-bombing abuse (per the TDD's edge case).

    SMS delivery is NOT wired up yet — no MSG91/Twilio credentials have been
    supplied. In DEBUG mode the OTP is returned in the response so the flow
    is testable end-to-end without a real SMS gateway. Wire the real send
    call in where `# TODO: send via MSG91/Twilio` is marked below.
    """
    window_start = timezone.now() - timedelta(hours=1)
    recent_count = OTPRequest.objects.filter(
        phone_number=phone_number, created_at__gte=window_start
    ).count()
    if recent_count >= OTP_RATE_LIMIT_PER_HOUR:
        return {'ok': False, 'error': 'Too many OTP requests. Try again later.'}

    otp = f"{random.randint(0, 999999):06d}"
    OTPRequest.objects.create(
        phone_number=phone_number,
        otp_hash=_hash_otp(otp, phone_number),
        expires_at=timezone.now() + timedelta(minutes=OTP_TTL_MINUTES),
    )

    # TODO: send via MSG91/Twilio once API credentials are available.
    # For now, log server-side and return it only when DEBUG=True.
    print(f"[DEV OTP] {phone_number}: {otp}")

    result = {'ok': True}
    if settings.DEBUG:
        result['debug_otp'] = otp
    return result


def verify_otp(phone_number: str, otp: str) -> bool:
    candidate = (
        OTPRequest.objects.filter(phone_number=phone_number, is_used=False)
        .order_by('-created_at')
        .first()
    )
    if not candidate:
        return False
    if candidate.expires_at < timezone.now():
        return False
    candidate.attempt_count += 1
    candidate.save(update_fields=['attempt_count'])
    if candidate.attempt_count > 5:
        return False
    if candidate.otp_hash != _hash_otp(otp, phone_number):
        return False
    candidate.is_used = True
    candidate.save(update_fields=['is_used'])
    return True
