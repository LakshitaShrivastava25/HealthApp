from django.conf import settings
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
from .serializers import AccountSerializer, SendOTPSerializer, StaffLoginSerializer, VerifyOTPSerializer
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
        if account.phone_number in settings.ADMIN_PHONE_NUMBERS and account.role != Account.Role.ADMIN:
            account.role = Account.Role.ADMIN
            account.is_staff = True
            account.save(update_fields=['role', 'is_staff'])
        refresh = RefreshToken.for_user(account)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'is_new_user': created,
            'account': AccountSerializer(account).data,
        })


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[-1].strip() if forwarded else '') or request.META.get('REMOTE_ADDR', '')


class StaffLoginView(APIView):
    """
    POST /api/auth/staff-login/ {email, password} — the web Admin Portal's
    sign-in (curapath.in/admin). Answers exactly like verify-otp: a token
    pair and the account. Only staff accounts that the Admin Portal would
    accept anyway can sign in here; see accounts.models.StaffCredential.

    Wrong email and wrong password get the same answer, so the form cannot
    be used to find out which emails exist. Throttled per client on top of
    the per-credential lockout.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = 'staff_login'

    def post(self, request):
        from admin_portal.models import AuditLog

        serializer = StaffLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'detail': 'Enter your email and password.'}, status=status.HTTP_400_BAD_REQUEST)

        result, account, locked_until = services.staff_password_login(
            serializer.validated_data['email'], serializer.validated_data['password']
        )
        if result == services.STAFF_LOGIN_LOCKED:
            minutes = max(1, -(-int((locked_until - timezone.now()).total_seconds()) // 60))
            return Response(
                {
                    'detail': f'Too many wrong attempts. Try again in {minutes} minute{"s" if minutes != 1 else ""}.',
                    'retry_after': minutes * 60,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={'Retry-After': str(minutes * 60)},
            )
        if result == services.STAFF_LOGIN_INVALID:
            return Response({'detail': 'Email or password is incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)
        if result == services.STAFF_LOGIN_NOT_ALLOWED:
            return Response(
                {'detail': 'This account does not have access to the Admin Portal.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        AuditLog.objects.create(
            staff=account, action='staff_password_login', target_type='account', target_id=str(account.id),
            detail={'ip': _client_ip(request)},
        )
        refresh = RefreshToken.for_user(account)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
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
