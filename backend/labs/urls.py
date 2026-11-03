from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('labs/providers', views.ServiceProviderViewSet, basename='serviceprovider')
router.register('labs/tests', views.TestOfferingViewSet, basename='testoffering')
router.register('labs/bookings', views.BookingViewSet, basename='booking')

urlpatterns = router.urls
