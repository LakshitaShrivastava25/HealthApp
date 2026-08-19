from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from doctors.models import Doctor
from documents.models import Document
from insurance.models import InsurancePolicy
from .mixins import AuditLogMixin
from .models import AuditLog
from .permissions import IsClaimsOps, IsOCRReviewer, IsStaffAdmin
from .serializers import (
    AdminAccountSerializer, AdminDoctorVerificationSerializer,
    AdminDocumentSerializer, AdminInsurancePolicySerializer, AuditLogSerializer,
)


class DashboardSummaryView(APIView):
    permission_classes = [IsStaffAdmin]

    def get(self, request):
        return Response({
            'total_users': Account.objects.filter(role=Account.Role.PATIENT).count(),
            'documents_needing_review': Document.objects.filter(status=Document.Status.NEEDS_REVIEW).count(),
            'policies_needing_review': InsurancePolicy.objects.filter(status=InsurancePolicy.Status.NEEDS_REVIEW).count(),
            'doctor_verification_queue': Doctor.objects.filter(verification_status=Doctor.VerificationStatus.PENDING).count(),
        })


class AdminDocumentViewSet(AuditLogMixin, viewsets.ModelViewSet):
    serializer_class = AdminDocumentSerializer
    permission_classes = [IsOCRReviewer]
    audit_target_type = 'document'
    http_method_names = ['get', 'patch']

    def get_queryset(self):
        qs = Document.objects.all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_update(self, serializer):
        instance = serializer.save(status=Document.Status.PROCESSED, processed_at=timezone.now())
        self._log(self.request, 'approve_document', instance)


class AdminInsurancePolicyViewSet(AuditLogMixin, viewsets.ModelViewSet):
    serializer_class = AdminInsurancePolicySerializer
    permission_classes = [IsClaimsOps]
    audit_target_type = 'insurance_policy'
    http_method_names = ['get', 'patch']

    def get_queryset(self):
        qs = InsurancePolicy.objects.all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_update(self, serializer):
        instance = serializer.save(status=InsurancePolicy.Status.VALIDATED)
        self._log(self.request, 'validate_policy', instance)


class AdminDoctorVerificationViewSet(AuditLogMixin, viewsets.ModelViewSet):
    serializer_class = AdminDoctorVerificationSerializer
    permission_classes = [IsStaffAdmin]
    audit_target_type = 'doctor'
    http_method_names = ['get', 'patch', 'post']

    def get_queryset(self):
        return Doctor.objects.all()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        doctor = self.get_object()
        doctor.verification_status = Doctor.VerificationStatus.VERIFIED
        doctor.save()
        self._log(request, 'approve_doctor', doctor)
        return Response(AdminDoctorVerificationSerializer(doctor).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        doctor = self.get_object()
        doctor.verification_status = Doctor.VerificationStatus.REJECTED
        doctor.save()
        self._log(request, 'reject_doctor', doctor)
        return Response(AdminDoctorVerificationSerializer(doctor).data)


class AdminAccountViewSet(AuditLogMixin, viewsets.ModelViewSet):
    serializer_class = AdminAccountSerializer
    permission_classes = [IsStaffAdmin]
    audit_target_type = 'account'
    http_method_names = ['get', 'patch', 'post']

    def get_queryset(self):
        qs = Account.objects.filter(role=Account.Role.PATIENT)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(phone_number__icontains=search)
        return qs

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        account = self.get_object()
        account.is_active = False
        account.save()
        self._log(request, 'deactivate_account', account)
        return Response(AdminAccountSerializer(account).data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsStaffAdmin]
    queryset = AuditLog.objects.all()
