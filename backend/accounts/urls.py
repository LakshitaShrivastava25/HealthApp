from django.urls import path
from rest_framework_simplejwt.views import TokenBlacklistView, TokenRefreshView

from .views import MeView, SendOTPView, StaffLoginView, VerifyOTPView

urlpatterns = [
    path('send-otp/', SendOTPView.as_view(), name='send-otp'),
    path('verify-otp/', VerifyOTPView.as_view(), name='verify-otp'),
    # Email + password for the web Admin Portal (curapath.in/admin).
    path('staff-login/', StaffLoginView.as_view(), name='staff-login'),
    path('refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    # {"refresh": ...} -> blacklists it, so logout ends the session server-side.
    path('logout/', TokenBlacklistView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
]
