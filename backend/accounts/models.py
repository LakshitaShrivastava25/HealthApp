import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


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
    SMS delivery goes through 2Factor.in (`request_otp` in accounts/services.py) —
    until TWOFACTOR_API_KEY is set, OTPs are logged server-side only.
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

    SMS    — a random OTP is sent through 2Factor.in (see accounts/services.py).
    MASTER — no SMS is sent; every phone number logs in with `master_otp`.
             Meant for testing / while the SMS gateway is down. Anyone who
             knows the code can sign in to ANY account, so keep it off in
             production unless you need it.
    """

    class Mode(models.TextChoices):
        SMS = 'sms', 'SMS (2Factor)'
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
        # First creation takes its mode from OTP_DEFAULT_MODE, so a fresh
        # deploy can start in master mode before any admin is able to log in.
        from django.conf import settings
        default = getattr(settings, 'OTP_DEFAULT_MODE', cls.Mode.SMS)
        if default not in cls.Mode.values:
            default = cls.Mode.SMS
        obj, _ = cls.objects.get_or_create(pk=1, defaults={'mode': default})
        return obj
