import base64
import hashlib
import hmac
import json
import logging
import math
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import OTPConfig, OTPRequest

OTP_TTL_MINUTES = 10  # the approved SMS text says "valid for 10 minutes"
OTP_RATE_LIMIT_PER_HOUR = 5
OTP_RESEND_COOLDOWN_SECONDS = 60  # minimum gap between two sends to one number
OTP_MAX_ATTEMPTS = 5  # same as Twilio Verify's 5 checks per verification
TWOFACTOR_TIMEOUT_SECONDS = 10
TWOFACTOR_SMS_URL = 'https://2factor.in/API/R1/'
TWILIO_TIMEOUT_SECONDS = 10
TWILIO_VERIFY_URL = 'https://verify.twilio.com/v2'
# Twilio error codes meaning "this number can't get an SMS": invalid To,
# landline, invalid phone number, not a mobile number.
TWILIO_BAD_NUMBER_CODES = {60200, 60205, 21211, 21614}

SEND_FAILED_ERROR = "Couldn't send the OTP SMS. Please try again."
BAD_NUMBER_ERROR = 'Check the mobile number and try again.'

# verify_otp results; VerifyOTPView maps each to a status + message.
VERIFY_OK = 'ok'
VERIFY_WRONG = 'wrong'
VERIFY_EXPIRED = 'expired'
VERIFY_LOCKED = 'locked'
VERIFY_UNAVAILABLE = 'unavailable'

logger = logging.getLogger(__name__)


def _hash_otp(otp: str, phone_number: str) -> str:
    return hashlib.sha256(f"{otp}:{phone_number}:{settings.SECRET_KEY}".encode()).hexdigest()


def _mask_phone(phone: str) -> str:
    return f"{'*' * max(len(phone) - 4, 0)}{phone[-4:]}"


def _send_via_2factor(phone_number: str, otp: str) -> tuple[bool, str]:
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
    rows). Returns (True, details) only on a "Success" response, otherwise
    (False, <2Factor's error text>). Never logs the API key, the request
    body (it contains the key and the OTP) or the OTP.
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
        return False, f"HTTP {exc.code}: {body.get('Details')}"
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.error('2Factor SMS OTP send failed for %s: %s', _mask_phone(phone), type(exc).__name__)
        return False, f'Could not reach 2Factor ({type(exc).__name__})'
    if body.get('Status') != 'Success':
        logger.error('2Factor SMS OTP send failed for %s: %s', _mask_phone(phone), body.get('Details'))
        return False, str(body.get('Details') or body)
    logger.info('2Factor SMS OTP accepted for %s', _mask_phone(phone))
    return True, str(body.get('Details') or 'Success')


def _twilio_credentials() -> tuple[str, str] | None:
    """
    Basic-auth pair for the Twilio API, or None when Twilio Verify isn't fully
    configured. An API key (SK... + secret) wins over the Account SID + Auth
    Token when both are set.
    """
    if not settings.TWILIO_VERIFY_SERVICE_SID:
        return None
    if settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET:
        return settings.TWILIO_API_KEY_SID, settings.TWILIO_API_KEY_SECRET
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
        return settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN
    return None


def _uses_twilio() -> bool:
    return not settings.USE_TWOFACTOR and _twilio_credentials() is not None


def _missing_sms_settings() -> list[str]:
    """Names (never values) of the settings the chosen SMS gateway still needs."""
    if settings.USE_TWOFACTOR:
        return [] if settings.TWOFACTOR_API_KEY else ['TWOFACTOR_API_KEY']
    missing = [] if settings.TWILIO_VERIFY_SERVICE_SID else ['TWILIO_VERIFY_SERVICE_SID']
    has_api_key = settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET
    has_token = settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN
    if not (has_api_key or has_token):
        missing.append('TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)')
    return missing


def _twilio_verify_post(endpoint: str, payload: dict) -> tuple[int, dict]:
    """
    POST to the Twilio Verify service, returning (HTTP status, JSON body).
    Status 0 means Twilio couldn't be reached at all. Never logs the
    credentials or the payload (VerificationCheck carries the code).
    """
    user, password = _twilio_credentials()
    url = (
        f'{TWILIO_VERIFY_URL}/Services/'
        f'{urllib.parse.quote(settings.TWILIO_VERIFY_SERVICE_SID)}/{endpoint}'
    )
    token = base64.b64encode(f'{user}:{password}'.encode()).decode()
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(payload).encode(),
        method='POST',
        headers={'Authorization': f'Basic {token}'},
    )
    try:
        with urllib.request.urlopen(request, timeout=TWILIO_TIMEOUT_SECONDS) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        # Twilio returns 4xx with a JSON body: {"code": 60200, "message": ...}
        try:
            return exc.code, json.loads(exc.read().decode())
        except ValueError:
            return exc.code, {}
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        return 0, {'message': f'Could not reach Twilio ({type(exc).__name__})'}


def _send_via_twilio(phone_number: str) -> tuple[bool, str, int | None]:
    """
    Starts a Twilio Verify SMS verification. Twilio generates the code and
    sends it, so there's no OTP here to send or store. Returns
    (True, status, None) on success, otherwise
    (False, "HTTP 400 (60200): <Twilio's message>", <Twilio error code or None>).
    """
    logger.info('Sending OTP via Twilio Verify to %s', _mask_phone(phone_number))
    status, body = _twilio_verify_post('Verifications', {'To': phone_number, 'Channel': 'sms'})
    if status not in (200, 201):
        code = body.get('code')
        logger.error(
            'Twilio Verify send failed for %s: HTTP %s %s %s',
            _mask_phone(phone_number), status, code, body.get('message'),
        )
        code = code if isinstance(code, int) else None
        prefix = f'HTTP {status} ({code})' if code is not None else f'HTTP {status}'
        return False, f"{prefix}: {body.get('message')}", code
    logger.info('Twilio Verify accepted OTP for %s', _mask_phone(phone_number))
    return True, str(body.get('status') or 'pending'), None


def _check_via_twilio(phone_number: str, otp: str) -> str:
    """
    Checks the code with Twilio, returning a VERIFY_* result:
      200 "approved"           -> ok
      200 "pending"            -> wrong (Twilio counted the check)
      404                      -> expired (expired, used or never sent)
      429 / code 60202         -> locked (max check attempts reached)
      unreachable / 5xx / auth -> unavailable (Twilio didn't judge the code)
    """
    status, body = _twilio_verify_post('VerificationCheck', {'To': phone_number, 'Code': otp})
    if status == 200:
        check_status = body.get('status')
        if check_status == 'approved':
            return VERIFY_OK
        if check_status == 'max_attempts_reached':
            return VERIFY_LOCKED
        if check_status in ('canceled', 'expired'):
            return VERIFY_EXPIRED
        return VERIFY_WRONG
    if status == 404:
        return VERIFY_EXPIRED
    logger.error(
        'Twilio Verify check failed for %s: HTTP %s %s %s',
        _mask_phone(phone_number), status, body.get('code'), body.get('message'),
    )
    if status == 429 or body.get('code') == 60202:
        return VERIFY_LOCKED
    if status == 0 or status >= 500 or status in (401, 403):
        return VERIFY_UNAVAILABLE
    # Any other 4xx (e.g. a malformed code) is the user's input being rejected.
    return VERIFY_WRONG


def master_otp_mode() -> tuple[bool, str]:
    """
    (is master mode on, master code). USE_MASTER_OTP / MASTER_OTP from env win
    when set; otherwise the admin-portal OTPConfig row decides.
    """
    config = OTPConfig.load()
    on = settings.USE_MASTER_OTP
    if on is None:
        on = config.mode == OTPConfig.Mode.MASTER
    code = settings.MASTER_OTP
    # verify-otp only accepts 6 digits, so any other env value could never
    # match — ignore it rather than lock everyone out.
    if code and not (code.isdigit() and len(code) == 6):
        logger.error('MASTER_OTP in env is not 6 digits; using the admin-portal master code instead')
        code = ''
    return on, code or config.master_otp


def request_otp(phone_number: str) -> dict:
    """
    Generates and stores a hashed OTP. Rate-limits to OTP_RATE_LIMIT_PER_HOUR
    per phone number to prevent SMS-bombing abuse (per the TDD's edge case).

    The SMS gateway is picked by settings.USE_TWOFACTOR:
      - false: Twilio Verify, when its credentials are set. Twilio owns the
        code; the OTPRequest row only backs the rate limit and attempt count.
      - true: 2Factor.in's transactional SMS API, when TWOFACTOR_API_KEY is set.
    With the chosen gateway unconfigured, the OTP is only printed to the server
    log — and returned in the response — when DEBUG=True, so the flow stays
    testable locally. Without DEBUG that's a 502: production never pretends
    an SMS went out.

    Checks run in this order: the hourly limit, then master mode (which sends
    nothing, so it skips the cooldown), then the OTP_RESEND_COOLDOWN_SECONDS
    gap since the newest OTPRequest for the number (429 + retry_after). The
    hourly limit goes first so a number out of quota isn't shown a countdown
    that would only end in "Too many OTP requests". Failed sends delete their
    row, so they never start a cooldown.
    """
    now = timezone.now()
    window_start = now - timedelta(hours=1)
    recent_count = OTPRequest.objects.filter(
        phone_number=phone_number, created_at__gte=window_start
    ).count()
    if recent_count >= OTP_RATE_LIMIT_PER_HOUR:
        return {'ok': False, 'error': 'Too many OTP requests. Try again later.'}

    if master_otp_mode()[0]:
        # Master mode: nothing is sent, verify_otp accepts the master code.
        # The code itself is never returned to the client.
        logger.info('OTP master mode: skipping SMS for %s', _mask_phone(phone_number))
        return {'ok': True}

    newest = (
        OTPRequest.objects.filter(phone_number=phone_number)
        .order_by('-created_at', '-id')
        .first()
    )
    if newest:
        remaining = (newest.created_at + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS) - now).total_seconds()
        if remaining > 0:
            wait = max(1, math.ceil(remaining))
            return {
                'ok': False,
                'error': f"Please wait {wait} second{'' if wait == 1 else 's'} before requesting another code.",
                'status': 429,
                'retry_after': wait,
            }

    uses_twilio = _uses_twilio()
    uses_twofactor = settings.USE_TWOFACTOR and bool(settings.TWOFACTOR_API_KEY)
    if not (uses_twilio or uses_twofactor or settings.DEBUG):
        logger.error(
            'No SMS gateway configured for OTPs (USE_TWOFACTOR=%s); missing: %s',
            settings.USE_TWOFACTOR, ', '.join(_missing_sms_settings()),
        )
        return {'ok': False, 'error': SEND_FAILED_ERROR, 'status': 502}

    expires_at = timezone.now() + timedelta(minutes=OTP_TTL_MINUTES)
    attempt_count = 0
    if uses_twilio:
        # A resend inside Twilio's window re-sends the SAME pending
        # verification (same code, same expiry, same check count), so the new
        # row inherits the live row's expiry and attempts. An exhausted row
        # isn't carried over: Twilio starts a fresh verification after max
        # checks, and if it hasn't, its 60202 still reports "locked".
        live = (
            OTPRequest.objects.filter(
                phone_number=phone_number, is_used=False, expires_at__gt=timezone.now(),
            )
            .order_by('-created_at', '-id')
            .first()
        )
        if live and live.attempt_count < OTP_MAX_ATTEMPTS:
            expires_at, attempt_count = live.expires_at, live.attempt_count

    # With Twilio this code is never sent; it only fills otp_hash with
    # something unguessable, so a local check could never match the row.
    otp = f"{random.SystemRandom().randint(0, 999999):06d}"
    otp_request = OTPRequest.objects.create(
        phone_number=phone_number,
        otp_hash=_hash_otp(otp, phone_number),
        expires_at=expires_at,
        attempt_count=attempt_count,
    )

    if uses_twilio:
        sent, _details, code = _send_via_twilio(phone_number)
        if not sent:
            otp_request.delete()
            if code in TWILIO_BAD_NUMBER_CODES:
                return {'ok': False, 'error': BAD_NUMBER_ERROR, 'status': 400}
            return {'ok': False, 'error': SEND_FAILED_ERROR, 'status': 502}
        return {'ok': True}

    if uses_twofactor:
        sent, _details = _send_via_2factor(phone_number, otp)
        if not sent:
            # Don't let a gateway failure eat into the user's hourly quota.
            otp_request.delete()
            return {'ok': False, 'error': SEND_FAILED_ERROR, 'status': 502}
        return {'ok': True}

    # No SMS gateway configured (DEBUG only, see above): log it and return it.
    print(f"[DEV OTP] {phone_number}: {otp}")
    return {'ok': True, 'debug_otp': otp}


def verify_otp(phone_number: str, otp: str) -> str:
    """
    Returns VERIFY_OK, or why the code was refused: VERIFY_WRONG,
    VERIFY_EXPIRED (no live code), VERIFY_LOCKED (more than OTP_MAX_ATTEMPTS
    checks) or VERIFY_UNAVAILABLE (Twilio couldn't judge it; no attempt used).
    """
    master_on, master_code = master_otp_mode()
    if master_on:
        return VERIFY_OK if hmac.compare_digest(otp, master_code) else VERIFY_WRONG

    candidate = (
        OTPRequest.objects.filter(phone_number=phone_number, is_used=False)
        .order_by('-created_at', '-id')  # id breaks same-timestamp ties
        .first()
    )
    if not candidate or candidate.expires_at < timezone.now():
        return VERIFY_EXPIRED
    candidate.attempt_count += 1
    candidate.save(update_fields=['attempt_count'])
    if candidate.attempt_count > OTP_MAX_ATTEMPTS:
        return VERIFY_LOCKED
    if _uses_twilio():
        result = _check_via_twilio(phone_number, otp)
        if result == VERIFY_UNAVAILABLE:
            # Twilio never saw the check, so it mustn't cost the user a try.
            candidate.attempt_count -= 1
            candidate.save(update_fields=['attempt_count'])
        if result != VERIFY_OK:
            return result
    elif candidate.otp_hash != _hash_otp(otp, phone_number):
        return VERIFY_WRONG
    candidate.is_used = True
    candidate.save(update_fields=['is_used'])
    return VERIFY_OK


def twofactor_balance() -> str:
    """
    Remaining transactional-SMS credits on the 2Factor account, or a short
    error string. Used by the admin OTP settings screen to diagnose delivery.
    """
    if not settings.TWOFACTOR_API_KEY:
        return 'TWOFACTOR_API_KEY is not set'
    url = (
        f'https://2factor.in/API/V1/{urllib.parse.quote(settings.TWOFACTOR_API_KEY)}'
        '/ADDON_SERVICES/BAL/TRANSACTIONAL_SMS'
    )
    try:
        with urllib.request.urlopen(url, timeout=TWOFACTOR_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode())
        except ValueError:
            return f'HTTP {exc.code}'
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        return f'Could not reach 2Factor ({type(exc).__name__})'
    return str(body.get('Details'))


def twofactor_delivery_status(session_id: str) -> str:
    """
    Operator delivery status for a sent SMS ("DELIVERED", "DLT-CNT-REJECT", ...),
    or '' while 2Factor has no status yet.

    2Factor answers the send call with "Success" as soon as it queues the
    message; DLT scrubbing happens afterwards, so a template/header mismatch
    only ever shows up here (e.g. DLT-CNT-REJECT = content doesn't match the
    DLT-approved template, or the header isn't linked to it).
    """
    url = (
        f'https://2factor.in/API/V1/{urllib.parse.quote(settings.TWOFACTOR_API_KEY)}'
        f'/ADDON_SERVICES/RPT/TSMS/{urllib.parse.quote(session_id)}'
    )
    try:
        with urllib.request.urlopen(url, timeout=TWOFACTOR_TIMEOUT_SECONDS) as resp:
            xml = resp.read().decode()
    except (urllib.error.URLError, TimeoutError, ValueError):
        return ''
    match = re.search(r'<statusDesc>([^<]*)</statusDesc>', xml)
    return match.group(1).strip() if match else ''


def send_test_sms(phone_number: str) -> tuple[bool, str, str]:
    """
    Admin diagnostic: send a throwaway OTP SMS, then poll the delivery report
    for a few seconds. Returns (accepted, gateway reply, delivery status).

    With Twilio Verify active it starts a real verification instead (Twilio
    picks the code); Verify has no delivery-report lookup, so the status
    stays ''.
    """
    if not settings.USE_TWOFACTOR:
        if _twilio_credentials() is None:
            return False, 'Twilio Verify is not configured on the server', ''
        # Twilio wants E.164; the admin may type "+91 98765 43210".
        ok, details, _code = _send_via_twilio(re.sub(r'[^\d+]', '', phone_number))
        return ok, details, ''
    if not settings.TWOFACTOR_API_KEY:
        return False, 'TWOFACTOR_API_KEY is not set on the server', ''
    otp = f"{random.SystemRandom().randint(0, 999999):06d}"
    ok, details = _send_via_2factor(phone_number, otp)
    status = ''
    if ok:
        for _ in range(4):
            time.sleep(2)
            status = twofactor_delivery_status(details)
            if status:
                break
    return ok, details, status
