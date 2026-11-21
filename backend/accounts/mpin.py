"""
App Lock: the 4-digit MPIN and the devices allowed to use it.

Kept out of services.py, which is already long and is about OTPs. The two
meet in exactly one place — changing an MPIN needs an OTP, and `issue_grant`
is handed the result of `services.verify_otp`.

The shape of the thing, because it is the part worth understanding before
reading the code: an MPIN belongs to an *account* and works on every device
the person has signed in on, while the right to use it belongs to a
*device* and is proved by a token that device was given when it completed
an SMS sign-in. Unlock sends the token and the PIN, and no phone number.

That split is what makes four digits safe. Ten thousand combinations is
nothing if the other half of the credential is a phone number, which is not
a secret: an attacker would not guess one account ten thousand times, they
would try `1234` against ten thousand accounts, and a per-account lockout
would not even notice. With a device token in the way there is nothing to
spray, and nobody can lock a stranger out of their own phone either.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from .models import MPINCredential, MPINResetGrant, TrustedDevice

MPIN_LENGTH = 4

# How long after an SMS sign-in a device may enrol without another one. The
# person has just proved the number is theirs; asking again inside the same
# few minutes buys nothing and costs an SMS.
SETUP_WINDOW = timedelta(minutes=int(getattr(settings, 'MPIN_SETUP_WINDOW_MINUTES', 15) or 15))

# Outcomes of unlock(). Strings rather than an enum to match VERIFY_* in
# services.py, which views.py already maps to responses the same way.
UNLOCK_OK = 'ok'
UNLOCK_WRONG = 'wrong'
UNLOCK_LOCKED = 'locked'
UNLOCK_UNKNOWN_DEVICE = 'unknown_device'
UNLOCK_NO_MPIN = 'no_mpin'
UNLOCK_INACTIVE = 'inactive'


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _peppered(account_id, mpin: str) -> str:
    """
    What actually gets hashed: the PIN, keyed by a secret that lives only in
    the environment and bound to the account.

    The pepper means a stolen database cannot be attacked offline — without
    it there is nothing to test a guess against. The account id means two
    people who both pick 2468 do not end up with the same hash.
    """
    pepper = getattr(settings, 'MPIN_PEPPER', '') or ''
    return hmac.new(pepper.encode(), f'{account_id}:{mpin}'.encode(), hashlib.sha256).hexdigest()


def is_well_formed(mpin) -> bool:
    """Exactly four ASCII digits. `str.isdigit()` would accept ٤٨٢١."""
    return isinstance(mpin, str) and len(mpin) == MPIN_LENGTH and all(c in '0123456789' for c in mpin)


# --- credential -----------------------------------------------------

def set_mpin(account, mpin: str) -> MPINCredential:
    """
    Store the PIN, and clear every device's failure state.

    The reset matters: someone who changes their PIN because they were
    locked out expects to be able to use it immediately, on every device.
    """
    credential, _ = MPINCredential.objects.update_or_create(
        account=account,
        defaults={'pin_hash': make_password(_peppered(account.id, mpin)), 'set_at': timezone.now()},
    )
    TrustedDevice.objects.filter(account=account).update(failed_attempts=0, locked_until=None)
    return credential


def check_mpin(credential: MPINCredential, mpin: str) -> bool:
    def upgrade(raw):
        # Re-hash when Django's default hasher changes, as StaffCredential does.
        credential.pin_hash = make_password(raw)
        credential.save(update_fields=['pin_hash'])

    return check_password(_peppered(credential.account_id, mpin), credential.pin_hash, upgrade)


def clear_mpin(account) -> None:
    """Turn App Lock off entirely: no credential, no devices."""
    MPINCredential.objects.filter(account=account).delete()
    TrustedDevice.objects.filter(account=account).delete()


def has_mpin(account) -> bool:
    return MPINCredential.objects.filter(account=account).exists()


# --- devices --------------------------------------------------------

def enroll_device(account, *, kind=TrustedDevice.Kind.MPIN, label='', platform='') -> str:
    """
    Register a device and return its token. Returned once; only the digest
    is kept, so a database dump cannot unlock anything.
    """
    raw = secrets.token_urlsafe(32)
    TrustedDevice.objects.create(
        account=account,
        token_hash=_sha256(raw),
        kind=kind,
        label=label[:80],
        platform=platform[:10],
    )
    return raw


def revoke_device(account, raw_token: str) -> int:
    deleted, _ = TrustedDevice.objects.filter(account=account, token_hash=_sha256(raw_token)).delete()
    return deleted


def recently_signed_in(account, now=None) -> bool:
    """Whether the account's last SMS sign-in is fresh enough to enrol on."""
    if not account.last_otp_login_at:
        return False
    return account.last_otp_login_at > (now or timezone.now()) - SETUP_WINDOW


def unlock(raw_token: str, mpin: str = ''):
    """
    Check a device token and PIN. Returns (outcome, device).

    Everything happens inside one `select_for_update`, for the reason
    verify_otp uses a conditional UPDATE: read-then-save lets a burst of
    parallel guesses all read the same counter and take far more tries than
    the limit allows.
    """
    if not raw_token:
        return UNLOCK_UNKNOWN_DEVICE, None

    now = timezone.now()
    with transaction.atomic():
        device = (
            TrustedDevice.objects.select_for_update()
            .select_related('account')
            .filter(token_hash=_sha256(raw_token), is_active=True)
            .first()
        )
        if device is None:
            return UNLOCK_UNKNOWN_DEVICE, None
        # Checked before anything else so that waiting out a cooldown never
        # costs an attempt — otherwise a locked-out person could burn their
        # remaining tries without ever being told a PIN was wrong.
        if device.is_locked(now):
            return UNLOCK_LOCKED, device
        if not device.account.is_active:
            return UNLOCK_INACTIVE, device

        credential = MPINCredential.objects.filter(account=device.account).first()
        if credential is None:
            return UNLOCK_NO_MPIN, device

        # A biometric token is already proof: the keychain only released it
        # after a live face or fingerprint match, so there is no PIN to ask
        # for. An MPIN token always needs one.
        ok = True if device.kind == TrustedDevice.Kind.BIOMETRIC else check_mpin(credential, mpin)

        if not ok:
            device.failed_attempts += 1
            if device.failed_attempts >= TrustedDevice.MAX_ATTEMPTS:
                device.is_active = False
            elif device.failed_attempts % TrustedDevice.ATTEMPTS_PER_STEP == 0:
                step = device.failed_attempts // TrustedDevice.ATTEMPTS_PER_STEP - 1
                device.locked_until = now + TrustedDevice.LOCKOUT_LADDER[min(step, len(TrustedDevice.LOCKOUT_LADDER) - 1)]
            device.save(update_fields=['failed_attempts', 'locked_until', 'is_active'])
            if not device.is_active:
                return UNLOCK_UNKNOWN_DEVICE, device
            return (UNLOCK_LOCKED if device.is_locked(now) else UNLOCK_WRONG), device

        device.failed_attempts = 0
        device.locked_until = None
        device.last_used_at = now
        device.save(update_fields=['failed_attempts', 'locked_until', 'last_used_at'])
        return UNLOCK_OK, device


def attempts_left(device: TrustedDevice) -> int:
    """How many guesses remain before the next cooldown."""
    used = device.failed_attempts % TrustedDevice.ATTEMPTS_PER_STEP
    return TrustedDevice.ATTEMPTS_PER_STEP - used


# --- grants ---------------------------------------------------------

def issue_grant(account) -> str:
    """Mint single-use proof that an OTP was just verified for this account."""
    raw = secrets.token_urlsafe(32)
    MPINResetGrant.objects.create(
        account=account,
        token_hash=_sha256(raw),
        expires_at=timezone.now() + MPINResetGrant.TTL,
    )
    return raw


def consume_grant(account, raw_token: str) -> bool:
    """
    Spend a grant, or report that it cannot be spent.

    Locked and re-read inside the transaction so two requests cannot both
    spend the same one.
    """
    if not raw_token:
        return False
    with transaction.atomic():
        grant = (
            MPINResetGrant.objects.select_for_update()
            .filter(account=account, token_hash=_sha256(raw_token))
            .first()
        )
        if grant is None or not grant.is_usable():
            return False
        grant.used_at = timezone.now()
        grant.save(update_fields=['used_at'])
        return True


def unlock_by_phone(phone_number: str, mpin: str):
    """
    Sign in with a number and a PIN, on a phone that has never enrolled.

    The apps register a device with a code first, so this path is the
    fallback rather than the usual way in. It is the weaker of the two —
    an attacker who knows a number gets to guess, and since no PIN is
    refused for being obvious, guessing 1234 is allowed to be tried.

    What holds the line is the ladder below, counted per account: three
    wrong guesses cost two minutes, escalating from there. Note that a
    lockout here never locks someone out of their own account, because
    sign-in by SMS code is untouched — which also means it cannot be used
    to deny someone access on purpose.
    """
    from .models import Account

    now = timezone.now()
    with transaction.atomic():
        credential = (
            MPINCredential.objects.select_for_update()
            .select_related('account')
            .filter(account__phone_number=phone_number)
            .first()
        )
        if credential is None:
            # Says nothing about whether the number is registered.
            return UNLOCK_NO_MPIN, None
        if credential.is_locked(now):
            return UNLOCK_LOCKED, credential
        if not credential.account.is_active:
            return UNLOCK_INACTIVE, credential

        if not check_mpin(credential, mpin):
            credential.failed_attempts += 1
            if credential.failed_attempts % MPINCredential.ATTEMPTS_PER_STEP == 0:
                step = credential.failed_attempts // MPINCredential.ATTEMPTS_PER_STEP - 1
                credential.locked_until = now + MPINCredential.LOCKOUT_LADDER[
                    min(step, len(MPINCredential.LOCKOUT_LADDER) - 1)
                ]
            credential.save(update_fields=['failed_attempts', 'locked_until'])
            return (UNLOCK_LOCKED if credential.is_locked(now) else UNLOCK_WRONG), credential

        credential.failed_attempts = 0
        credential.locked_until = None
        credential.save(update_fields=['failed_attempts', 'locked_until'])
        return UNLOCK_OK, credential


def account_attempts_left(credential: MPINCredential) -> int:
    used = credential.failed_attempts % MPINCredential.ATTEMPTS_PER_STEP
    return MPINCredential.ATTEMPTS_PER_STEP - used
