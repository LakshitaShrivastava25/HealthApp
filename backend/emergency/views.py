import secrets

from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
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


def public_emergency_view(request, token):
    """
    GET /public/emergency/{token}/ — unauthenticated. Deliberately bypasses
    login, so the allow-list here must never be widened to full history.

    Renders a real, readable HTML page by default — this URL only exists
    to be opened from a scanned QR code, so whoever scans it needs
    something they can actually read at a glance, not raw JSON. The old
    JSON-only response is kept available at ?format=json for any
    programmatic caller, so nothing that depended on it breaks.
    """
    ep = get_object_or_404(EmergencyProfile, public_token=token)
    wants_json = request.GET.get('format') == 'json'

    if not ep.is_active:
        if wants_json:
            return JsonResponse({'detail': 'This emergency card has been revoked.'}, status=404)
        return render(request, 'emergency/public_card.html', {'revoked': True}, status=404)

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

    if wants_json:
        return JsonResponse(PublicEmergencyViewSerializer(data).data)

    return render(request, 'emergency/public_card.html', {'revoked': False, **data})
