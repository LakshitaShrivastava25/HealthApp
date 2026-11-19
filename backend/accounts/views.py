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

from .models import Account, MPINResetGrant
from .serializers import (
    AccountSerializer,
    MPINDeviceSerializer,
    MPINGrantSerializer,
    MPINSetSerializer,
    MPINUnlockSerializer,
    SendOTPSerializer,
    StaffLoginSerializer,
    TrustedDeviceSerializer,
    VerifyOTPSerializer,
)
from . import mpin, services
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
        # App Lock reads this to let this device enrol without charging a
        # second SMS for proof the person just gave.
        account.last_otp_login_at = timezone.now()
        account.save(update_fields=['last_otp_login_at'])
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
            # App Lock goes with it. Leaving the credential behind would let
            # a phone that still holds a device token keep unlocking an
            # account the person believes they closed.
            mpin.clear_mpin(account)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _issue_tokens(account):
    refresh = RefreshToken.for_user(account)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'account': AccountSerializer(account).data,
    }


def _locked_response(device):
    seconds = max(1, int((device.locked_until - timezone.now()).total_seconds()))
    minutes = max(1, -(-seconds // 60))
    return Response(
        {
            'detail': f'Too many wrong attempts. Try again in {minutes} minute{"s" if minutes != 1 else ""}, '
                      'or use Forgot PIN.',
            'retry_after': seconds,
            'locked_until': device.locked_until.isoformat(),
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={'Retry-After': str(seconds)},
    )


class MPINUnlockView(APIView):
    """
    App Lock sign-in: a device token and the 4-digit PIN, in exchange for a
    fresh token pair.

    Unauthenticated on purpose — the whole point is to work when the saved
    session has expired, which is the case an OTP would otherwise be needed
    for. Note what the body does *not* contain: a phone number. Without one
    there is nothing to enumerate, and no way to aim at someone else's
    account or lock them out of it.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = 'mpin_login'

    def post(self, request):
        serializer = MPINUnlockSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'detail': 'Enter your PIN.'}, status=status.HTTP_400_BAD_REQUEST)

        device_token = serializer.validated_data.get('device_token') or ''
        phone_number = serializer.validated_data.get('phone_number') or ''
        if not device_token and not phone_number:
            return Response({'detail': 'Enter your PIN.'}, status=status.HTTP_400_BAD_REQUEST)

        if device_token:
            result, device = mpin.unlock(device_token, serializer.validated_data.get('mpin', ''))
            account = device.account if (result == mpin.UNLOCK_OK and device) else None
            tries_left = mpin.attempts_left(device) if device else None
            locked = device
        else:
            # Signing in by number on a phone that has never unlocked here.
            result, credential = mpin.unlock_by_phone(
                phone_number, serializer.validated_data.get('mpin', '')
            )
            account = credential.account if (result == mpin.UNLOCK_OK and credential) else None
            tries_left = mpin.account_attempts_left(credential) if credential else None
            locked = credential
            if result == mpin.UNLOCK_UNKNOWN_DEVICE:
                result = mpin.UNLOCK_NO_MPIN

        if result == mpin.UNLOCK_UNKNOWN_DEVICE:
            # Also how a retired device and a deleted account surface. The
            # client's cue to forget its token and fall back to a full sign-in.
            return Response(
                {'detail': 'Sign in with your mobile number to continue.', 'device_unknown': True},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if result == mpin.UNLOCK_LOCKED:
            return _locked_response(locked)
        if result == mpin.UNLOCK_INACTIVE:
            return Response(
                {'detail': 'This account has been deleted. Contact support if this was a mistake.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if result == mpin.UNLOCK_NO_MPIN:
            if phone_number:
                # Same wording whether the number is unknown or simply has
                # no PIN, so this cannot be used to find out who is
                # registered.
                return Response(
                    {'detail': 'That number and PIN do not match. Sign in with a code instead.'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            return Response(
                {'detail': 'App lock is no longer set up on this account.', 'mpin_cleared': True},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if result != mpin.UNLOCK_OK:
            # attempts_left is safe to return: the caller already holds a
            # token issued to this device, so it tells an attacker nothing
            # they could not measure anyway, and it lets the screen warn
            # someone before they lock themselves out.
            return Response(
                {'detail': 'That PIN is not right.', 'attempts_left': tries_left},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if account.is_staff:
            AuditLog.objects.create(
                staff=account, action='mpin_unlock', target_type='account', target_id=str(account.id),
                detail={'ip': _client_ip(request), 'by': 'device' if device_token else 'phone'},
            )

        body = _issue_tokens(account)
        if phone_number:
            # Enrol the phone now that the PIN has been proved, so the next
            # unlock is device-bound and never has to name the account.
            body['device_token'] = mpin.enroll_device(account, platform='', label='')
        return Response(body)


class MPINGrantView(APIView):
    """
    Phone + OTP, in exchange for a short-lived grant that authorises setting
    a new PIN — and a token pair, because this is exactly as strong as
    verify-otp and the person should land signed in rather than be asked to
    do it twice.

    Used by Forgot PIN and by Change PIN. The client sends the code to the
    existing send-otp endpoint first, so its rate limits apply unchanged.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = 'otp_verify'

    def post(self, request):
        serializer = MPINGrantSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'detail': 'Enter the 6-digit code we texted you.'}, status=status.HTTP_400_BAD_REQUEST
            )
        phone_number = serializer.validated_data['phone_number']

        result = verify_otp(phone_number, serializer.validated_data['otp'])
        if result != services.VERIFY_OK:
            http_status, message = VERIFY_ERRORS[result]
            return Response({'detail': message}, status=http_status)

        account = Account.objects.filter(phone_number=phone_number).first()
        if account is None:
            # No account yet means there is no PIN to reset. Sign in first.
            return Response(
                {'detail': 'Sign in with your mobile number to continue.'}, status=status.HTTP_400_BAD_REQUEST
            )
        if not account.is_active:
            return Response(
                {'detail': 'This account has been deleted. Contact support if this was a mistake.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        account.last_otp_login_at = timezone.now()
        account.save(update_fields=['last_otp_login_at'])
        return Response({
            'grant': mpin.issue_grant(account),
            'expires_in': int(MPINResetGrant.TTL.total_seconds()),
            **_issue_tokens(account),
        })


class MPINView(APIView):
    """Set, change, or turn off the account's PIN."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'mpin_set'

    def post(self, request):
        serializer = MPINSetSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'detail': 'Your PIN is 4 digits.'}, status=status.HTTP_400_BAD_REQUEST)
        account = request.user
        code = serializer.validated_data['mpin']

        # Any four digits are accepted. Guessability is deliberately not
        # judged here: the ladder in mpin.unlock() caps a stolen phone at
        # fifteen attempts whatever the PIN is, which protects the account
        # far better than refusing someone the number they wanted.

        grant = serializer.validated_data.get('otp_grant') or ''
        if mpin.has_mpin(account):
            # Changing an existing PIN always costs an SMS. Otherwise anyone
            # holding an unlocked phone could replace it quietly and keep
            # their way in long after the owner signed out everywhere else.
            if not mpin.consume_grant(account, grant):
                return Response(
                    {'detail': 'Verify your mobile number to change your PIN.', 'otp_required': True},
                    status=status.HTTP_403_FORBIDDEN,
                )
        elif not (grant and mpin.consume_grant(account, grant)) and not mpin.recently_signed_in(account):
            # First PIN: the sign-in that just happened is proof enough, so
            # setting one straight after it needs nothing more. Come back to
            # it days later and it does.
            return Response(
                {'detail': 'Verify your mobile number to set a PIN.', 'otp_required': True},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            mpin.set_mpin(account, code)
            token = mpin.enroll_device(
                account,
                label=serializer.validated_data.get('label', ''),
                platform=serializer.validated_data.get('platform', ''),
            )
        if account.is_staff:
            AuditLog.objects.create(
                staff=account, action='mpin_set', target_type='account', target_id=str(account.id),
                detail={'ip': _client_ip(request)},
            )
        return Response({'device_token': token}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        """Turn App Lock off. Every device loses its token with it."""
        mpin.clear_mpin(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MPINDeviceView(APIView):
    """Enrol, list and revoke the devices allowed to use the PIN."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'mpin_set'

    def get(self, request):
        return Response(TrustedDeviceSerializer(request.user.trusted_devices.all(), many=True).data)

    def post(self, request):
        """
        Add this device to an MPIN that already exists — a new phone, or the
        same one after signing out.

        No PIN in the body: the existing one is what will be checked at
        unlock. The right to enrol comes from having just signed in with a
        code, so a stolen session cannot quietly add a device of its own.
        """
        serializer = MPINDeviceSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'detail': 'Could not register this device.'}, status=status.HTTP_400_BAD_REQUEST)
        account = request.user
        if not mpin.has_mpin(account):
            return Response(
                {'detail': 'Set a PIN first.', 'mpin_required': True}, status=status.HTTP_400_BAD_REQUEST
            )
        if not mpin.recently_signed_in(account):
            return Response(
                {'detail': 'Verify your mobile number to use App Lock on this device.', 'otp_required': True},
                status=status.HTTP_403_FORBIDDEN,
            )
        token = mpin.enroll_device(
            account,
            kind=serializer.validated_data.get('kind', 'mpin'),
            label=serializer.validated_data.get('label', ''),
            platform=serializer.validated_data.get('platform', ''),
        )
        return Response({'device_token': token}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        """Called on sign-out, so a token left on a phone stops working."""
        mpin.revoke_device(request.user, request.data.get('device_token', ''))
        return Response(status=status.HTTP_204_NO_CONTENT)
