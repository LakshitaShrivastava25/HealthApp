import re

from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from doctors.models import Doctor
from documents.models import Document
from family.models import Profile
from insurance.models import InsurancePolicy
from .mixins import AuditLogMixin
from .models import AuditLog
from .permissions import IsClaimsOps, IsOCRReviewer, IsStaffAdmin
from .serializers import (
    AdminAccountSerializer, AdminDoctorVerificationSerializer,
    AdminDocumentSerializer, AdminInsurancePolicySerializer,
    AdminPatientProfileSerializer, AuditLogSerializer,
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
    """
    The doctor verification queue. Served at both /api/admin/doctor-verification/
    (what the web and mobile admin screens call) and /api/admin/doctors/.

    Every registration lands here whatever the NMC register check found; an
    admin approving or rejecting is the only thing that verifies or rejects
    a doctor.

      ?status=review                    pending + under review + register unreachable
      ?status=verified | rejected | …   one status, or several comma-separated
    """
    serializer_class = AdminDoctorVerificationSerializer
    permission_classes = [IsStaffAdmin]
    audit_target_type = 'doctor'
    http_method_names = ['get', 'post']

    def get_queryset(self):
        # select_related: the serializer reads account and verified_by for
        # every row, which would otherwise be extra queries per doctor.
        qs = Doctor.objects.select_related('account', 'verified_by')
        wanted = (self.request.query_params.get('status') or '').strip()
        if self.action == 'verification_queue' and not wanted:
            wanted = 'review'
        if wanted:
            statuses = set()
            for part in wanted.split(','):
                part = part.strip()
                statuses.update(Doctor.AWAITING_ADMIN if part == 'review' else [part])
            qs = qs.filter(verification_status__in=statuses)
        # Oldest first: the queue is worked in the order doctors applied.
        return qs.order_by('submitted_at', 'full_name')

    @action(detail=False, methods=['get'], url_path='verification-queue')
    def verification_queue(self, request):
        """GET .../verification-queue/ — the doctors waiting for a decision (paginated)."""
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        doctor = self.get_object()
        doctor.verification_status = Doctor.VerificationStatus.VERIFIED
        doctor.verified_at = timezone.now()
        doctor.verified_by = request.user
        doctor.rejection_reason = ''
        if not doctor.verification_provider:
            doctor.verification_provider = Doctor.Provider.MANUAL
        doctor.save()
        self._log(request, 'approve_doctor', doctor)
        return Response(AdminDoctorVerificationSerializer(doctor).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        doctor = self.get_object()
        # The reason is shown to the doctor so they can correct their details.
        # Optional for app versions whose Reject button sends none.
        reason = str(request.data.get('reason') or '').strip()[:1000]
        doctor.verification_status = Doctor.VerificationStatus.REJECTED
        doctor.rejection_reason = reason or 'Your registration could not be verified.'
        doctor.verified_at = timezone.now()
        doctor.verified_by = request.user
        doctor.save()
        self._log(request, 'reject_doctor', doctor)
        return Response(AdminDoctorVerificationSerializer(doctor).data)

    @action(detail=True, methods=['post'])
    def reverify(self, request, pk=None):
        """Ask the NMC register again (fresh, not cached). Records what it says; decides nothing."""
        from doctors.services.verification import apply_verification

        doctor = apply_verification(self.get_object(), use_cache=False)
        self._log(request, 'reverify_doctor', doctor)
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


class AdminPatientProfileViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/admin/patients/ — every registered patient profile, for staff.

    This is a SEPARATE endpoint rather than a relaxation of
    family.ProfileViewSet. That viewset is correctly scoped to "your own
    family's profiles" (plus a doctor's approved patients), and widening it
    for an admin case would put staff logic on the patient-facing path where
    a future mistake leaks real medical records. Gated with the same
    IsStaffAdmin used by every other screen in this app.

    ReadOnlyModelViewSet: list and retrieve only, so there is no way to edit
    or delete a patient's profile from here.
    """
    serializer_class = AdminPatientProfileSerializer
    permission_classes = [IsStaffAdmin]

    def get_queryset(self):
        qs = Profile.objects.select_related('account').all()
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search) | Q(account__phone_number__icontains=search)
            )
        return qs.order_by('-created_at')


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsStaffAdmin]
    queryset = AuditLog.objects.all()


class OTPSettingsView(APIView):
    """
    GET   /api/admin/otp-settings/  — current OTP mode + SMS gateway health.
    PATCH /api/admin/otp-settings/  — {"mode": "master"|"sms", "master_otp"?: "555555"}
    POST  /api/admin/otp-settings/  — {"test_phone": "+91..."} sends a test SMS
                                      through the active gateway (Twilio Verify
                                      or 2Factor) and returns its reply verbatim.
    """
    permission_classes = [IsStaffAdmin]

    # Common Twilio Verify send failures -> what the admin should do, as
    # (error codes, lowercase message fragments, hint). Details look like
    # "HTTP 400 (60200): <message>"; the code decides when present, the
    # message fragments only when Twilio sent no code.
    TWILIO_HINTS = (
        ((60200, 21211), ('invalid parameter',),
         'Twilio rejected the number. Enter it in full international format, e.g. +919876543210.'),
        ((60203,), ('max send attempts',),
         'Too many codes were sent to this number. Wait about 10 minutes and try again.'),
        ((60205, 21614), ('landline',),
         'This number is a landline and cannot receive SMS. Use a mobile number.'),
        ((60410, 60605), ('blocked', 'geo'),
         "Twilio blocked SMS to this number's country. Enable the country under Verify > Geo permissions "
         'in the Twilio Console (and check Fraud Guard).'),
        ((20003,), ('http 401', 'authenticat'),
         'Twilio rejected the credentials. Check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN (or the API key) '
         'in the server .env.'),
    )

    @classmethod
    def _twilio_hint(cls, details):
        match = re.match(r'HTTP \d+ \((\d+)\):', str(details))
        if match:
            code = int(match.group(1))
            return next((hint for codes, _, hint in cls.TWILIO_HINTS if code in codes), '')
        text = str(details).lower()
        return next((hint for _, fragments, hint in cls.TWILIO_HINTS if any(f in text for f in fragments)), '')

    def _payload(self, config, check_balance=True):
        from django.conf import settings as dj_settings
        from accounts.models import OTPConfig
        from accounts.services import _twilio_credentials, master_otp_mode, twofactor_balance
        use_twofactor = dj_settings.USE_TWOFACTOR
        master_on, master_code = master_otp_mode()
        return {
            'mode': OTPConfig.Mode.MASTER if master_on else OTPConfig.Mode.SMS,
            'master_otp': master_code,
            # True when USE_MASTER_OTP in env overrides the toggle here.
            'mode_locked_by_env': dj_settings.USE_MASTER_OTP is not None,
            # True when MASTER_OTP in env overrides the code saved here.
            'master_otp_locked_by_env': bool(dj_settings.MASTER_OTP),
            'updated_at': config.updated_at,
            'updated_by': config.updated_by.phone_number if config.updated_by else None,
            'sms_provider': '2factor' if use_twofactor else 'twilio',
            'sms_configured': bool(dj_settings.TWOFACTOR_API_KEY) if use_twofactor
            else _twilio_credentials() is not None,
            'sms_sender_id': dj_settings.TWOFACTOR_SENDER_ID,
            'sms_template_name': dj_settings.TWOFACTOR_TEMPLATE_NAME,
            # 2Factor only; Twilio Verify has no SMS credit balance to show.
            'sms_balance': twofactor_balance() if check_balance and use_twofactor else None,
        }

    def get(self, request):
        from accounts.models import OTPConfig
        return Response(self._payload(OTPConfig.load()))

    def patch(self, request):
        from django.conf import settings as dj_settings
        from accounts.models import OTPConfig
        config = OTPConfig.load()
        mode = request.data.get('mode')
        if mode is not None:
            # Saving a mode the env overrides would silently do nothing.
            if dj_settings.USE_MASTER_OTP is not None:
                return Response({
                    'detail': 'OTP mode is locked by USE_MASTER_OTP in the server .env; remove it to use this switch.',
                }, status=409)
            if mode not in OTPConfig.Mode.values:
                return Response({'detail': 'mode must be "sms" or "master".'}, status=400)
            config.mode = mode
        master = request.data.get('master_otp')
        if master is not None:
            master = str(master).strip()
            if not (master.isdigit() and len(master) == 6):
                return Response({'detail': 'Master OTP must be exactly 6 digits.'}, status=400)
            config.master_otp = master
        # The built-in code is published in the repository, so outside DEBUG
        # master mode ignores it (accounts/services.master_otp_mode). Say so
        # here rather than let the switch appear to do nothing.
        from accounts.services import DEFAULT_MASTER_OTP
        effective_code = dj_settings.MASTER_OTP or config.master_otp
        if config.mode == OTPConfig.Mode.MASTER and not dj_settings.DEBUG and effective_code == DEFAULT_MASTER_OTP:
            return Response({
                'detail': f'Set your own 6-digit master code first — the default {DEFAULT_MASTER_OTP} is publicly known.',
            }, status=400)
        config.updated_by = request.user
        config.save()
        AuditLog.objects.create(
            staff=request.user, action=f'otp_mode_{config.mode}',
            target_type='otp_settings', target_id='1',
        )
        return Response(self._payload(config, check_balance=False))

    def post(self, request):
        from django.conf import settings as dj_settings
        from accounts.services import send_test_sms
        phone = str(request.data.get('test_phone') or '').strip()
        if len(''.join(c for c in phone if c.isdigit())) < 10:
            return Response({'detail': 'Enter a valid phone number.'}, status=400)
        ok, details, delivery = send_test_sms(phone)
        hint = ''
        if not ok and not dj_settings.USE_TWOFACTOR:
            hint = self._twilio_hint(details)
        elif 'DLT' in delivery.upper():
            hint = (
                'The operator rejected the SMS on DLT checks. Make sure the 2Factor template text matches the '
                'DLT-approved template exactly, the header (sender ID) is linked to that template on the DLT portal, '
                'and set TWOFACTOR_DLT_PE_ID / TWOFACTOR_DLT_TEMPLATE_ID on the server.'
            )
        return Response({'ok': ok, 'details': details, 'delivery_status': delivery or 'pending', 'hint': hint})
