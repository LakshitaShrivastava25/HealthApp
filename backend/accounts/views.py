from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Account
from .serializers import AccountSerializer, SendOTPSerializer, VerifyOTPSerializer
from .services import request_otp, verify_otp


class SendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = request_otp(serializer.validated_data['phone_number'])
        if not result.get('ok'):
            return Response(
                {'detail': result['error']},
                status=result.get('status', status.HTTP_429_TOO_MANY_REQUESTS),
            )
        return Response(result, status=status.HTTP_200_OK)


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone_number = serializer.validated_data['phone_number']
        otp = serializer.validated_data['otp']

        if not verify_otp(phone_number, otp):
            return Response({'detail': 'Invalid or expired OTP'}, status=status.HTTP_400_BAD_REQUEST)

        account, created = Account.objects.get_or_create(phone_number=phone_number)
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
        """
        request.user.is_active = False
        request.user.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)
