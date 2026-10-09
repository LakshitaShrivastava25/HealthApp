from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from doctors.models import DoctorPatientAccess
from emergency.models import EmergencyProfile

from .models import Account
from .serializers import AccountSerializer, SendOTPSerializer, VerifyOTPSerializer
from . import services
from .services import request_otp, verify_otp

# verify_otp result -> (HTTP status, message shown on the login screen).
VERIFY_ERRORS = {
    services.VERIFY_WRONG: (status.HTTP_400_BAD_REQUEST, "That code isn't right. Check it and try again."),
    services.VERIFY_EXPIRED: (status.HTTP_400_BAD_REQUEST, 'This code has expired. Tap Resend to get a new one.'),
    services.VERIFY_LOCKED: (status.HTTP_429_TOO_MANY_REQUESTS, 'Too many wrong attempts. Tap Resend to get a new code.'),
    services.VERIFY_UNAVAILABLE: (status.HTTP_502_BAD_GATEWAY, "Couldn't check the code right now. Please try again."),
}


class SendOTPView(APIView):
    permission_classes = [AllowAny]
    # On top of request_otp's per-number limits: those stop one number being
    # flooded, this stops one client walking through many numbers.
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = 'otp_send'

    def post(self, request):
        serializer = SendOTPSerializer(data=request.data)
        if not serializer.is_valid():
            # phone_number is the only field, so any error means a bad number.
            return Response({'detail': 'Enter a valid mobile number.'}, status=status.HTTP_400_BAD_REQUEST)
        result = request_otp(serializer.validated_data['phone_number'])
        if not result.get('ok'):
            body, headers = {'detail': result['error']}, None
            if 'retry_after' in result:
                # Resend cooldown: clients count down from retry_after.
                body['retry_after'] = result['retry_after']
                headers = {'Retry-After': str(result['retry_after'])}
            return Response(
                body,
                status=result.get('status', status.HTTP_429_TOO_MANY_REQUESTS),
                headers=headers,
            )
        return Response(result, status=status.HTTP_200_OK)


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = 'otp_verify'

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        if not serializer.is_valid():
            # Reject malformed input before verify_otp, so it never costs an attempt.
            detail = (
                'Enter a valid mobile number.' if 'phone_number' in serializer.errors
                else 'Enter the 6-digit code we texted you.'
            )
            return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)
        phone_number = serializer.validated_data['phone_number']
        otp = serializer.validated_data['otp']

        result = verify_otp(phone_number, otp)
        if result != services.VERIFY_OK:
            http_status, message = VERIFY_ERRORS[result]
            return Response({'detail': message}, status=http_status)

        account, created = Account.objects.get_or_create(phone_number=phone_number)
        if not account.is_active and services.reviewer_otp(phone_number):
            # Play reviewers test Delete account; the next review still needs a login.
            account.is_active = True
            account.save(update_fields=['is_active'])
        if not account.is_active:
            return Response(
                {'detail': 'This account has been deleted. Contact support if this was a mistake.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        refresh = RefreshToken.for_user(account)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'is_new_user': created,
            'account': AccountSerializer(account).data,
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(AccountSerializer(request.user).data)

    def patch(self, request):
        serializer = AccountSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request):
        """
        Self-service account deletion (Settings → Delete Account). This is
        a soft delete — is_active=False — not a hard erase of medical
        records. django-rest-framework-simplejwt already rejects any token
        (existing or freshly issued) for an inactive user on every
        subsequent authenticated request, so this immediately locks the
        account out; VerifyOTPView below also blocks a fresh login attempt
        with a clear message rather than a confusing later failure.

        Everything the account had shared stops being shared with it: doctor
        grants (pending or approved) are revoked and emergency cards stop
        resolving, as the /delete-account page promises.
        """
        account = request.user
        with transaction.atomic():
            account.is_active = False
            account.save(update_fields=['is_active'])
            DoctorPatientAccess.objects.filter(
                profile__account=account,
                status__in=[DoctorPatientAccess.Status.PENDING, DoctorPatientAccess.Status.APPROVED],
            ).update(status=DoctorPatientAccess.Status.REVOKED)
            EmergencyProfile.objects.filter(
                profile__account=account, revoked_at__isnull=True,
            ).update(revoked_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)
