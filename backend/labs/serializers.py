from rest_framework import serializers

from .models import Booking, ServiceProvider, TestOffering


class TestOfferingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestOffering
        fields = [
            'id', 'provider', 'test_name', 'test_category', 'price',
            'home_visit_available', 'turnaround_hours', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ServiceProviderSerializer(serializers.ModelSerializer):
    test_offerings = TestOfferingSerializer(many=True, read_only=True)

    class Meta:
        model = ServiceProvider
        fields = [
            'id', 'name', 'provider_type', 'address', 'city', 'state',
            'pincode', 'latitude', 'longitude', 'contact_phone',
            'contact_email', 'operating_hours', 'service_area_pincodes',
            'is_verified', 'test_offerings', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ServiceProviderListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceProvider
        fields = [
            'id', 'name', 'provider_type', 'address', 'city', 'state',
            'pincode', 'latitude', 'longitude', 'contact_phone',
            'is_verified', 'created_at',
        ]


class BookingSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source='test_offering.provider.name', read_only=True)
    test_name = serializers.CharField(source='test_offering.test_name', read_only=True)

    class Meta:
        model = Booking
        fields = [
            'id', 'account', 'profile', 'test_offering', 'booking_type',
            'status', 'address', 'preferred_time_slot', 'provider_notes',
            'provider_name', 'test_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'account', 'status', 'provider_notes', 'created_at', 'updated_at']


class BookingStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Booking.Status.choices)
