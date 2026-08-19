from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import EmergencyProfileViewSet, public_emergency_view

router = DefaultRouter()
router.register('emergency-qr', EmergencyProfileViewSet, basename='emergency-qr')

urlpatterns = router.urls + [
    path('public/emergency/<str:token>/', public_emergency_view, name='public-emergency'),
]
