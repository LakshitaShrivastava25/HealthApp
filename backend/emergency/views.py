import secrets

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import EmergencyProfile
from .serializers import EmergencyProfileSerializer, PublicEmergencyViewSerializer


class EmergencyProfileViewSet(viewsets.ModelViewSet):
    serializer_class = EmergencyProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return EmergencyProfile.objects.filter(profile__account=self.request.user)

    @action(detail=True, methods=['post'])
    def regenerate(self, request, pk=None):
        emergency_profile = self.get_object()
        emergency_profile.public_token = secrets.token_urlsafe(24)
        emergency_profile.revoked_at = None
        emergency_profile.save()
        return Response(EmergencyProfileSerializer(emergency_profile).data)

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        emergency_profile = self.get_object()
        emergency_profile.revoked_at = timezone.now()
        emergency_profile.save()
        return Response(EmergencyProfileSerializer(emergency_profile).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_emergency_view(request, token):
    """
    GET /public/emergency/{token}/ — unauthenticated. Deliberately bypasses
    login, so the allow-list here must never be widened to full history.
    """
    ep = get_object_or_404(EmergencyProfile, public_token=token)
    if not ep.is_active:
        return Response({'detail': 'This emergency card has been revoked.'}, status=404)

    profile = ep.profile
    data = {'name': profile.full_name}
    if ep.include_blood_group:
        data['blood_group'] = profile.blood_group
    if ep.include_allergies:
        data['allergies'] = list(profile.allergies.values_list('substance', flat=True))
    if ep.include_medications:
        data['medications'] = list(profile.medications.filter(is_active=True).values_list('name', flat=True))
    if ep.include_emergency_contact:
        data['emergency_contact_name'] = ep.emergency_contact_name
        data['emergency_contact_phone'] = ep.emergency_contact_phone

    return Response(PublicEmergencyViewSerializer(data).data)
