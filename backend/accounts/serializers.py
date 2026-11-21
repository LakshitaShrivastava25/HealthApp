from django.core.validators import RegexValidator
from rest_framework import serializers

from .models import Account, TrustedDevice

# E.164: "+", a non-zero country code digit, 7-14 digits in all, so the whole
# string fits Account.phone_number / OTPRequest.phone_number (max_length=15).
# [0-9], not \d: \d also matches non-ASCII digits such as "٩".
E164_PHONE = RegexValidator(r'^\+[1-9][0-9]{6,13}$', 'Enter a valid mobile number.')
OTP_CODE = RegexValidator(r'^[0-9]{6}$', 'Enter the 6-digit code we texted you.')
# Same [0-9] reasoning as above: \d would accept Arabic-Indic digits, which
# would then never match the PIN the person believes they set.
MPIN_CODE = RegexValidator(r'^[0-9]{4}$', 'Your PIN is 4 digits.')


class SendOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=15, validators=[E164_PHONE])


class VerifyOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=15, validators=[E164_PHONE])
    otp = serializers.CharField(max_length=6, validators=[OTP_CODE])


class StaffLoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    # Passwords are compared exactly as typed: no trimming.
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class MPINSetSerializer(serializers.Serializer):
    mpin = serializers.CharField(max_length=4, validators=[MPIN_CODE], trim_whitespace=False)
    # Required when an MPIN already exists; see MPINView for why.
    otp_grant = serializers.CharField(max_length=128, required=False, allow_blank=True)
    label = serializers.CharField(max_length=80, required=False, allow_blank=True)
    platform = serializers.CharField(max_length=10, required=False, allow_blank=True)


class MPINUnlockSerializer(serializers.Serializer):
    # Either: a token from a phone that has unlocked before, or the number
    # itself on a phone that has not. Validated in the view, since exactly
    # one of the two is required.
    device_token = serializers.CharField(max_length=128, required=False, allow_blank=True)
    phone_number = serializers.CharField(
        max_length=15, required=False, allow_blank=True, validators=[E164_PHONE]
    )
    # Blank for a biometric-class device, whose token the keychain only
    # released after a live match — there is no PIN to ask for.
    mpin = serializers.CharField(max_length=4, required=False, allow_blank=True, trim_whitespace=False)


class MPINGrantSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=15, validators=[E164_PHONE])
    otp = serializers.CharField(max_length=6, validators=[OTP_CODE])


class MPINDeviceSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80, required=False, allow_blank=True)
    platform = serializers.CharField(max_length=10, required=False, allow_blank=True)
    kind = serializers.ChoiceField(choices=['mpin', 'biometric'], required=False, default='mpin')


class TrustedDeviceSerializer(serializers.ModelSerializer):
    """What Settings shows. Never the token hash."""

    class Meta:
        model = TrustedDevice
        fields = ['id', 'label', 'platform', 'kind', 'created_at', 'last_used_at']
        read_only_fields = fields


class AccountSerializer(serializers.ModelSerializer):
    # Lets the apps decide whether to offer "set up App Lock" or "unlock"
    # without a second round trip.
    has_mpin = serializers.SerializerMethodField()

    def get_has_mpin(self, account) -> bool:
        return hasattr(account, 'mpin')

    class Meta:
        model = Account
        fields = ['id', 'phone_number', 'email', 'role', 'date_joined', 'has_mpin']
        # phone_number is the login itself. Writable here, an account could
        # PATCH its number to someone else's not-yet-registered one and keep
        # its session: that person's first sign-in would then land in the
        # attacker's account, and everything they uploaded would be shared
        # with it. Changing a number needs an OTP to the new one — a flow of
        # its own, not a profile edit.
        read_only_fields = ['id', 'phone_number', 'role', 'date_joined', 'has_mpin']
