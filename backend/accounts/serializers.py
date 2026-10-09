from django.core.validators import RegexValidator
from rest_framework import serializers

from .models import Account

# E.164: "+", a non-zero country code digit, 7-14 digits in all, so the whole
# string fits Account.phone_number / OTPRequest.phone_number (max_length=15).
# [0-9], not \d: \d also matches non-ASCII digits such as "٩".
E164_PHONE = RegexValidator(r'^\+[1-9][0-9]{6,13}$', 'Enter a valid mobile number.')
OTP_CODE = RegexValidator(r'^[0-9]{6}$', 'Enter the 6-digit code we texted you.')


class SendOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=15, validators=[E164_PHONE])


class VerifyOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=15, validators=[E164_PHONE])
    otp = serializers.CharField(max_length=6, validators=[OTP_CODE])


class StaffLoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    # Passwords are compared exactly as typed: no trimming.
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'phone_number', 'email', 'role', 'date_joined']
        # phone_number is the login itself. Writable here, an account could
        # PATCH its number to someone else's not-yet-registered one and keep
        # its session: that person's first sign-in would then land in the
        # attacker's account, and everything they uploaded would be shared
        # with it. Changing a number needs an OTP to the new one — a flow of
        # its own, not a profile edit.
        read_only_fields = ['id', 'phone_number', 'role', 'date_joined']
