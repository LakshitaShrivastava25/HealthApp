from django.contrib import admin

from .models import Booking, ServiceProvider, TestOffering


@admin.register(ServiceProvider)
class ServiceProviderAdmin(admin.ModelAdmin):
    list_display = ['name', 'provider_type', 'city', 'pincode', 'is_verified']
    list_filter = ['provider_type', 'is_verified', 'state']
    search_fields = ['name', 'city', 'pincode']


@admin.register(TestOffering)
class TestOfferingAdmin(admin.ModelAdmin):
    list_display = ['test_name', 'provider', 'price', 'home_visit_available']
    list_filter = ['home_visit_available', 'test_category']
    search_fields = ['test_name']


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ['test_offering', 'profile', 'booking_type', 'status', 'created_at']
    list_filter = ['status', 'booking_type']
    readonly_fields = ['created_at', 'updated_at']
