from django.db import models
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from family.permissions import assert_owns_profile
from .models import Booking, ServiceProvider, TestOffering
from .serializers import (
    BookingSerializer,
    BookingStatusSerializer,
    ServiceProviderListSerializer,
    ServiceProviderSerializer,
    TestOfferingSerializer,
)


class ServiceProviderViewSet(viewsets.ReadOnlyModelViewSet):
    """/api/labs/providers/ — browse blood banks and pathology labs."""
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ServiceProvider.objects.filter(is_verified=True)
        provider_type = self.request.query_params.get('type')
        city = self.request.query_params.get('city')
        pincode = self.request.query_params.get('pincode')
        if provider_type:
            qs = qs.filter(provider_type=provider_type)
        if city:
            qs = qs.filter(city__iexact=city)
        if pincode:
            qs = qs.filter(
                models.Q(pincode=pincode) |
                models.Q(service_area_pincodes__contains=[pincode])
            )
        return qs.prefetch_related('test_offerings')

    def get_serializer_class(self):
        if self.action == 'list':
            return ServiceProviderListSerializer
        return ServiceProviderSerializer


class TestOfferingViewSet(viewsets.ReadOnlyModelViewSet):
    """/api/labs/tests/ — search available tests across providers."""
    serializer_class = TestOfferingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TestOffering.objects.filter(provider__is_verified=True)
        provider = self.request.query_params.get('provider')
        search = self.request.query_params.get('search')
        category = self.request.query_params.get('category')
        if provider:
            qs = qs.filter(provider_id=provider)
        if search:
            qs = qs.filter(test_name__icontains=search)
        if category:
            qs = qs.filter(test_category__iexact=category)
        return qs.select_related('provider')


class BookingViewSet(viewsets.ModelViewSet):
    """/api/labs/bookings/ — book and track lab tests."""
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Booking.objects.filter(account=self.request.user)
            .select_related('test_offering__provider', 'profile')
        )

    def perform_create(self, serializer):
        profile = serializer.validated_data['profile']
        assert_owns_profile(self.request.user, profile)
        serializer.save(account=self.request.user)

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        booking = self.get_object()
        body = BookingStatusSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        booking.status = body.validated_data['status']
        booking.save(update_fields=['status', 'updated_at'])
        return Response(BookingSerializer(booking).data)
