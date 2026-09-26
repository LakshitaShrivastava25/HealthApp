import hashlib
import json
import logging
import random
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import OTPRequest

OTP_TTL_MINUTES = 5
OTP_RATE_LIMIT_PER_HOUR = 5
TWOFACTOR_TIMEOUT_SECONDS = 10

logger = logging.getLogger(__name__)


def _hash_otp(otp: str, phone_number: str) -> str:
    return hashlib.sha256(f"{otp}:{phone_number}:{settings.SECRET_KEY}".encode()).hexdigest()


def _send_via_2factor(phone_number: str, otp: str) -> bool:
    """
    Sends our own generated OTP through 2Factor.in's "custom OTP" SMS API:
      GET https://2factor.in/API/V1/{api_key}/SMS/{phone}/{otp}[/{template}]
    Verification stays local (hashed OTPRequest rows), so 2Factor's
    session id is not needed. Returns True only on a "Success" response.
    """
    phone = re.sub(r'\D', '', phone_number)  # "+91 98765 43210" -> "919876543210"
    parts = [settings.TWOFACTOR_API_KEY, 'SMS', phone, otp]
    if settings.TWOFACTOR_OTP_TEMPLATE:
        parts.append(settings.TWOFACTOR_OTP_TEMPLATE)
    url = 'https://2factor.in/API/V1/' + '/'.join(urllib.parse.quote(p, safe='') for p in parts)
    try:
        with urllib.request.urlopen(url, timeout=TWOFACTOR_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        # 2Factor returns 4xx with a JSON body explaining the problem.
        try:
            body = json.loads(exc.read().decode())
        except ValueError:
            body = {'Details': str(exc)}
        logger.error('2Factor OTP send failed for %s: %s', phone, body.get('Details'))
        return False
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.error('2Factor OTP send failed for %s: %s', phone, exc)
        return False
    if body.get('Status') != 'Success':
        logger.error('2Factor OTP send failed for %s: %s', phone, body.get('Details'))
        return False
    return True


def request_otp(phone_number: str) -> dict:
    """
    Generates and stores a hashed OTP. Rate-limits to OTP_RATE_LIMIT_PER_HOUR
    per phone number to prevent SMS-bombing abuse (per the TDD's edge case).

    SMS delivery goes through 2Factor.in when TWOFACTOR_API_KEY is set.
    Without a key, the OTP is only printed to the server log — and returned
    in the response when DEBUG=True — so the flow stays testable locally.
    """
    window_start = timezone.now() - timedelta(hours=1)
    recent_count = OTPRequest.objects.filter(
        phone_number=phone_number, created_at__gte=window_start
    ).count()
    if recent_count >= OTP_RATE_LIMIT_PER_HOUR:
        return {'ok': False, 'error': 'Too many OTP requests. Try again later.'}

    otp = f"{random.SystemRandom().randint(0, 999999):06d}"
    otp_request = OTPRequest.objects.create(
        phone_number=phone_number,
        otp_hash=_hash_otp(otp, phone_number),
        expires_at=timezone.now() + timedelta(minutes=OTP_TTL_MINUTES),
    )

    if settings.TWOFACTOR_API_KEY:
        if not _send_via_2factor(phone_number, otp):
            # Don't let a gateway failure eat into the user's hourly quota.
            otp_request.delete()
            return {'ok': False, 'error': "Couldn't send the OTP SMS. Please try again.", 'status': 502}
        return {'ok': True}

    # No SMS gateway configured: log server-side, expose only in DEBUG.
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
