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


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'phone_number', 'email', 'role', 'date_joined']
        read_only_fields = ['id', 'role', 'date_joined']
