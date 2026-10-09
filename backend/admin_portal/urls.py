from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminAccountViewSet, AdminDoctorVerificationViewSet, AdminDocumentViewSet,
    AdminInsurancePolicyViewSet, AdminPatientProfileViewSet, AuditLogViewSet,
    DashboardSummaryView, OTPSettingsView,
)

router = DefaultRouter()
router.register('documents', AdminDocumentViewSet, basename='admin-document')
router.register('insurance-policies', AdminInsurancePolicyViewSet, basename='admin-insurance-policy')
router.register('doctor-verification', AdminDoctorVerificationViewSet, basename='admin-doctor-verification')
# The same queue under the name the NMC verification brief uses:
# /api/admin/doctors/verification-queue/, /api/admin/doctors/{id}/approve/ …
router.register('doctors', AdminDoctorVerificationViewSet, basename='admin-doctors')
router.register('accounts', AdminAccountViewSet, basename='admin-account')
router.register('patients', AdminPatientProfileViewSet, basename='admin-patient')
router.register('audit-log', AuditLogViewSet, basename='admin-audit-log')

urlpatterns = router.urls + [
    path('otp-settings/', OTPSettingsView.as_view(), name='admin-otp-settings'),
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='admin-dashboard-summary'),
]
