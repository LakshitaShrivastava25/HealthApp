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

OTP_TTL_MINUTES = 10  # the approved SMS text says "valid for 10 minutes"
OTP_RATE_LIMIT_PER_HOUR = 5
TWOFACTOR_TIMEOUT_SECONDS = 10
TWOFACTOR_SMS_URL = 'https://2factor.in/API/R1/'

logger = logging.getLogger(__name__)


def _hash_otp(otp: str, phone_number: str) -> str:
    return hashlib.sha256(f"{otp}:{phone_number}:{settings.SECRET_KEY}".encode()).hexdigest()


def _mask_phone(phone: str) -> str:
    return f"{'*' * max(len(phone) - 4, 0)}{phone[-4:]}"


def _send_via_2factor(phone_number: str, otp: str) -> bool:
    """
    Sends the OTP as a plain DLT transactional SMS through 2Factor.in
    ("Send Single SMS" in the current 2Factor API docs):
      POST https://2factor.in/API/R1/
        module=TRANS_SMS, apikey, to, from=<Sender ID>,
        templatename=<approved template>, var1=<OTP>

    This deliberately does NOT use 2Factor's SMS OTP API (/API/V1/.../SMS/...):
    that product can deliver the code by an automated voice call on 2Factor's
    side, even when called with an approved SMS template. The transactional
    SMS module only sends SMS, so there is no voice path here at all.

    2Factor rejects this request ("Missing templatename value") without
    templatename, and ("Incorrect sender id and templatename provided") unless
    the Sender ID + template are mapped under Transactional SMS in the 2Factor
    dashboard. The OTP fills the template's first variable. Verification stays local (hashed OTPRequest
    rows). Returns True only on a "Success" response. Never logs the API
    key, the request body (it contains the key and the OTP) or the OTP.
    """
    phone = re.sub(r'\D', '', phone_number)  # "+91 98765 43210" -> "919876543210"
    payload = {
        'module': 'TRANS_SMS',
        'apikey': settings.TWOFACTOR_API_KEY,
        'to': phone,
        'from': settings.TWOFACTOR_SENDER_ID,
        'templatename': settings.TWOFACTOR_TEMPLATE_NAME,
        'var1': otp,
    }
    if settings.TWOFACTOR_DLT_PE_ID:
        payload['peid'] = settings.TWOFACTOR_DLT_PE_ID
    if settings.TWOFACTOR_DLT_TEMPLATE_ID:
        payload['ctid'] = settings.TWOFACTOR_DLT_TEMPLATE_ID
    request = urllib.request.Request(
        TWOFACTOR_SMS_URL,
        data=urllib.parse.urlencode(payload).encode(),
        method='POST',
    )
    logger.info(
        'Sending OTP via 2Factor SMS to %s (POST %s, module=TRANS_SMS, sender=%s, template=%s)',
        _mask_phone(phone), TWOFACTOR_SMS_URL, settings.TWOFACTOR_SENDER_ID, settings.TWOFACTOR_TEMPLATE_NAME,
    )
    try:
        with urllib.request.urlopen(request, timeout=TWOFACTOR_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        # 2Factor returns 4xx with a JSON body explaining the problem.
        try:
            body = json.loads(exc.read().decode())
        except ValueError:
            body = {'Details': f'HTTP {exc.code}'}
        logger.error('2Factor SMS OTP send failed for %s: HTTP %s %s', _mask_phone(phone), exc.code, body.get('Details'))
        return False
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.error('2Factor SMS OTP send failed for %s: %s', _mask_phone(phone), type(exc).__name__)
        return False
    if body.get('Status') != 'Success':
        logger.error('2Factor SMS OTP send failed for %s: %s', _mask_phone(phone), body.get('Details'))
        return False
    logger.info('2Factor SMS OTP accepted for %s', _mask_phone(phone))
    return True


def request_otp(phone_number: str) -> dict:
    """
    Generates and stores a hashed OTP. Rate-limits to OTP_RATE_LIMIT_PER_HOUR
    per phone number to prevent SMS-bombing abuse (per the TDD's edge case).

    SMS delivery goes through 2Factor.in's transactional SMS API when
    TWOFACTOR_API_KEY is set.
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
