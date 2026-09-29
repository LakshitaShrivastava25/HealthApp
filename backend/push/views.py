from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PushDevice
from .serializers import PushDeviceSerializer


class PushDeviceView(APIView):
    """
    POST   registers this phone for the signed-in account (idempotent).
    DELETE unregisters it — called on logout so the next person to sign in
           on a shared phone doesn't receive the previous account's alerts.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PushDeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushDevice.objects.update_or_create(
            token=serializer.validated_data['token'],
            defaults={
                'account': request.user,
                'platform': serializer.validated_data.get('platform', ''),
                'is_active': True,
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request):
        token = request.data.get('token') or request.query_params.get('token')
        if token:
            PushDevice.objects.filter(account=request.user, token=token).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
