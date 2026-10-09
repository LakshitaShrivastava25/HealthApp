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
