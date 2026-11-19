import uuid
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class AccountManager(BaseUserManager):
    def create_user(self, phone_number, password=None, **extra_fields):
        if not phone_number:
            raise ValueError('Phone number is required')
        account = self.model(phone_number=phone_number, **extra_fields)
        if password:
            account.set_password(password)
        else:
            account.set_unusable_password()
        account.save(using=self._db)
        return account

    def create_superuser(self, phone_number, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', Account.Role.ADMIN)
        return self.create_user(phone_number, password, **extra_fields)


class Account(AbstractBaseUser, PermissionsMixin):
    """
    The root login entity. A patient Account can hold multiple FamilyMember
    profiles (see family.Profile). Staff and Doctor accounts also use this
    same table, distinguished by `role` — matches the TDD's auth model.
    """

    class Role(models.TextChoices):
        PATIENT = 'patient', 'Patient'
        DOCTOR = 'doctor', 'Doctor'
        ADMIN = 'admin', 'Admin'
        OCR_REVIEWER = 'ocr_reviewer', 'OCR Reviewer'
        CLAIMS_OPS = 'claims_ops', 'Claims Ops'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_number = models.CharField(max_length=15, unique=True)
    email = models.EmailField(blank=True, null=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PATIENT)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    # When this account last proved itself with an SMS code. App Lock reads
    # it to let a device enrol just after signing in without charging a
    # second SMS for the same proof. Deliberately a column rather than the
    # access token's `iat`: ROTATE_REFRESH_TOKENS re-issues that on every
    # refresh, so it would say "authenticated seconds ago" forever.
    last_otp_login_at = models.DateTimeField(null=True, blank=True)

    objects = AccountManager()

    USERNAME_FIELD = 'phone_number'
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.phone_number


class OTPRequest(models.Model):
    """
    Hashed, short-TTL OTP per phone number. Never store OTPs in plain text.
    SMS delivery goes through Twilio Verify or 2Factor.in, picked by
    USE_TWOFACTOR (`request_otp` in accounts/services.py). With Twilio the code
    lives at Twilio and this row only backs the rate limit and attempt count.
    Until the chosen gateway is configured, OTPs are logged server-side only.
    """

    phone_number = models.CharField(max_length=15, db_index=True)
    otp_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    attempt_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']


class OTPConfig(models.Model):
    """
    Singleton (pk=1) switch for how login OTPs are delivered, flipped by an
    admin from the web/mobile admin portal or Django admin — no redeploy.

    SMS    — a random OTP is sent through Twilio Verify, or 2Factor.in when
             USE_TWOFACTOR=true (see accounts/services.py).
    MASTER — no SMS is sent; every phone number logs in with `master_otp`.
             Meant for testing / while the SMS gateway is down. Anyone who
             knows the code can sign in to ANY account, so keep it off in
             production unless you need it.
    """

    class Mode(models.TextChoices):
        SMS = 'sms', 'SMS'
        MASTER = 'master', 'Master OTP'

    mode = models.CharField(max_length=10, choices=Mode.choices, default=Mode.SMS)
    master_otp = models.CharField(max_length=6, default='555555')
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )

    class Meta:
        verbose_name = 'OTP setting'
        verbose_name_plural = 'OTP settings'

    def __str__(self):
        return f'OTP mode: {self.get_mode_display()}'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        # First creation takes its mode from OTP_DEFAULT_MODE (default 'sms'),
        # so a fresh deploy can opt into master mode before any admin can log in.
        from django.conf import settings
        default = getattr(settings, 'OTP_DEFAULT_MODE', cls.Mode.SMS)
        if default not in cls.Mode.values:
            default = cls.Mode.SMS
        obj, _ = cls.objects.get_or_create(pk=1, defaults={'mode': default})
        return obj


class StaffCredential(models.Model):
    """
    Email + password sign-in for the web Admin Portal (curapath.in/admin) —
    a second way into an existing staff account, alongside OTP. Set with
    `manage.py set_staff_login`; there is no self-service sign-up.

    Deliberately NOT Account.password. Django's own /admin/ login checks
    that field with no rate limit at all, so a password stored there could
    be guessed indefinitely. This one is accepted only by StaffLoginView,
    which is throttled and locks the credential after repeated failures.

    The account still has to pass the usual staff check (a staff role AND a
    number on ADMIN_PHONE_NUMBERS) on every sign-in and every request, so a
    credential alone never grants anything.
    """

    MAX_FAILURES = 5
    LOCK_DURATION = timedelta(minutes=15)

    account = models.OneToOneField(Account, on_delete=models.CASCADE, related_name='staff_credential')
    # Stored lowercase; looked up lowercase.
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=128)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    password_changed_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.email

    def set_password(self, raw_password):
        self.password = make_password(raw_password)
        self.password_changed_at = timezone.now()

    def check_password(self, raw_password):
        def upgrade(raw):
            # Re-hash with the current hasher when Django's default changes.
            self.password = make_password(raw)
            self.save(update_fields=['password'])

        return check_password(raw_password, self.password, upgrade)

    def is_locked(self, now=None):
        return bool(self.locked_until and self.locked_until > (now or timezone.now()))


class MPINCredential(models.Model):
    """
    The account's 4-digit App Lock PIN — one per account, working on every
    device the person has signed in on.

    Not hashed the way OTPs are. `_hash_otp` in services.py is a plain
    SHA-256, which is right for a 6-digit code that lives for ten minutes
    and allows five guesses, and wrong for a credential that lives for
    years: ten thousand SHA-256 hashes take microseconds, so a stolen
    database would give up every PIN it holds.

    So: PBKDF2 (Django's `make_password`) over an HMAC of the PIN keyed by
    MPIN_PEPPER. The pepper lives only in the environment, never in the
    database, so a dump on its own is not enough to test a guess against —
    and `pepper_version` lets it be rotated later without invalidating
    everyone at once. The account id goes into the HMAC input as well, so
    two people who pick the same PIN do not share a hash.

    No failure counters here. They belong on TrustedDevice: counting per
    account would let a thief with one phone lock the owner out of another.
    """

    # Three wrong guesses cost two minutes, then more. Same ladder as
    # TrustedDevice, counted per account because a sign-in by number has no
    # device to count against yet.
    ATTEMPTS_PER_STEP = 3
    LOCKOUT_LADDER = (timedelta(minutes=2), timedelta(minutes=15), timedelta(hours=1), timedelta(hours=24))

    account = models.OneToOneField(Account, on_delete=models.CASCADE, related_name='mpin')
    pin_hash = models.CharField(max_length=256)
    pepper_version = models.PositiveSmallIntegerField(default=1)
    set_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    # Only for sign-in by number + PIN. A device that is already enrolled
    # counts on its own row, so one phone's failures never lock another.
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    def is_locked(self, now=None):
        return bool(self.locked_until and self.locked_until > (now or timezone.now()))

    def __str__(self):
        return f'MPIN for {self.account.phone_number}'


class TrustedDevice(models.Model):
    """
    One phone that may unlock with the MPIN.

    This is what keeps a four-digit PIN defensible. Unlock is device token
    plus PIN, and the request carries no phone number at all, so there is
    nothing to enumerate and no way to reach an account without first
    holding a secret issued to a device that completed an SMS sign-in.
    Without it, an attacker needs only a phone number — which is not a
    secret — and the handful of PINs people actually choose, and can spray
    thousands of accounts at once. A per-account lockout would also let
    anyone lock any user out on demand.

    The token is 32 random bytes, handed back once at enrolment and stored
    only as a SHA-256 digest. Plain SHA-256 is right here, unlike for the
    PIN above: 256 bits of entropy has nothing to brute force, and the
    lookup has to be an indexed equality match.

    Failures count per device and escalate. Fifteen wrong guesses in total
    retire the device for good — 15 tries against 10,000 combinations is a
    0.15% chance, which is the real answer to "someone stole my phone".
    """

    class Kind(models.TextChoices):
        MPIN = 'mpin', 'MPIN'
        # Held in the keychain behind Face ID / fingerprint, so possession
        # of the token already proves a live biometric match and no PIN is
        # asked for. Kept separate from the MPIN token on purpose: a
        # keychain dump then yields only the one that still needs the PIN.
        BIOMETRIC = 'biometric', 'Biometric'

    # Three wrong guesses cost two minutes, and each further three costs
    # more. A flat cooldown would allow roughly ninety guesses an hour,
    # which walks the whole keyspace inside a week.
    ATTEMPTS_PER_STEP = 3
    LOCKOUT_LADDER = (timedelta(minutes=2), timedelta(minutes=15), timedelta(hours=1), timedelta(hours=24))
    MAX_ATTEMPTS = 15

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='trusted_devices')
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.MPIN)
    label = models.CharField(max_length=80, blank=True)
    platform = models.CharField(max_length=10, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-last_used_at', '-created_at']

    def __str__(self):
        return f'{self.label or self.kind} ({self.account.phone_number})'

    def is_locked(self, now=None):
        return bool(self.locked_until and self.locked_until > (now or timezone.now()))


class MPINResetGrant(models.Model):
    """
    Proof that an OTP was just verified for this account, good for ten
    minutes and one use.

    Changing an MPIN has to cost an SMS — otherwise anyone holding an
    unlocked phone could quietly replace the PIN and keep access after the
    owner signs out everywhere. A grant carries that proof from the OTP
    screen to the "choose a new PIN" screen without the second screen
    having to handle the code itself.
    """

    TTL = timedelta(minutes=10)

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='mpin_grants')
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'MPIN grant for {self.account.phone_number}'

    def is_usable(self, now=None):
        now = now or timezone.now()
        return self.used_at is None and self.expires_at > now
