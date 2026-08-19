from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ConsultationNote, Doctor, DoctorPatientAccess
from .serializers import ConsultationNoteSerializer, DoctorPatientAccessSerializer, DoctorSerializer


class DoctorViewSet(viewsets.ModelViewSet):
    """
    /api/doctors/ — registration creates a Doctor row with verification_status=pending.
    Admin Portal approves/rejects (see admin_portal app). Doctors can't log in
    to the Doctor Portal meaningfully until verified.
    """
    serializer_class = DoctorSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Doctor.objects.all()

    @transaction.atomic
    def perform_create(self, serializer):
        # Guards against a 500 crash (UNIQUE constraint violation) if
        # registration is ever attempted twice for the same account — found
        # by reproducing a real user's error report, where a stale frontend
        # session let a Register submission reach an account that already
        # had a Doctor record.
        if hasattr(self.request.user, 'doctor_profile'):
            raise ValidationError({'detail': 'This account is already registered as a doctor.'})
        serializer.save(account=self.request.user, verification_status=Doctor.VerificationStatus.PENDING)
        # The Account itself defaults to role=PATIENT on creation (it's
        # created by the same OTP login any patient uses) — without this,
        # a registered doctor's account keeps showing role=patient forever,
        # which is exactly the bug found in the Admin Portal's "Users &
        # Accounts" list: doctors were quietly counted as patients because
        # nothing had ever updated this field after Doctor registration.
        #
        # @transaction.atomic above ties this write to the Doctor row
        # created just above — if either write fails, both roll back, so
        # an account can never end up at role=doctor with no Doctor record
        # (or vice versa). Found and fixed after review flagged that the
        # two writes were previously independent.
        self.request.user.role = self.request.user.Role.DOCTOR
        self.request.user.save(update_fields=['role'])

    @action(detail=False, methods=['get'])
    def me(self, request):
        """
        GET /api/doctors/me/ — lets the Doctor Portal find the logged-in
        doctor's own record (their id, verification_status) without every
        doctor's data being scannable by account. 404 if this account has
        no Doctor record yet (hasn't registered).
        """
        doctor = getattr(request.user, 'doctor_profile', None)
        if not doctor:
            return Response({'detail': 'No doctor profile for this account.'}, status=404)
        return Response(DoctorSerializer(doctor).data)


class DoctorPatientAccessViewSet(viewsets.ModelViewSet):
    """
    Consent flow: doctor requests → patient approves/denies from their side.

    SECURITY: approve/deny must only ever be callable by the patient side of
    the grant — a doctor calling these on their own request would let them
    self-grant access to any patient, bypassing consent entirely. This was
    found and fixed after testing it directly: a doctor could create a grant
    naming themselves and immediately approve it with no patient action at
    all. get_queryset alone does NOT prevent this, because a doctor's own
    queryset legitimately includes their own pending requests — the object
    lookup succeeds, so the block has to happen in the action itself.
    """
    serializer_class = DoctorPatientAccessSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'doctor_profile'):
            qs = DoctorPatientAccess.objects.filter(doctor=user.doctor_profile)
        else:
            qs = DoctorPatientAccess.objects.filter(profile__account=user)
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs

    def perform_create(self, serializer):
        # Only a verified doctor may initiate an access request, and only
        # for themselves — the 'doctor' field from the request body is
        # never trusted, even if the caller is a doctor, so one doctor
        # can't submit a request naming a different doctor.
        user = self.request.user
        doctor = getattr(user, 'doctor_profile', None)
        if not doctor:
            raise PermissionDenied('Only doctors can request patient access.')
        if doctor.verification_status != Doctor.VerificationStatus.VERIFIED:
            raise PermissionDenied('Your account is not yet verified — you cannot request patient access.')
        serializer.save(doctor=doctor)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        grant = self.get_object()
        if hasattr(request.user, 'doctor_profile'):
            raise PermissionDenied('Only the patient can approve access to their own records.')
        grant.status = DoctorPatientAccess.Status.APPROVED
        grant.responded_at = timezone.now()
        grant.save()
        return Response(DoctorPatientAccessSerializer(grant).data)

    @action(detail=True, methods=['post'])
    def deny(self, request, pk=None):
        grant = self.get_object()
        if hasattr(request.user, 'doctor_profile'):
            raise PermissionDenied('Only the patient can deny access to their own records.')
        grant.status = DoctorPatientAccess.Status.DENIED
        grant.responded_at = timezone.now()
        grant.save()
        return Response(DoctorPatientAccessSerializer(grant).data)

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        # Either side may end an existing grant — the patient revoking
        # their own consent, or the doctor voluntarily giving up access.
        # This is intentionally NOT restricted the way approve/deny are,
        # since starting/widening access needs consent but narrowing it
        # doesn't.
        grant = self.get_object()
        grant.status = DoctorPatientAccess.Status.REVOKED
        grant.save()
        return Response(DoctorPatientAccessSerializer(grant).data)


class ConsultationNoteViewSet(viewsets.ModelViewSet):
    serializer_class = ConsultationNoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'doctor_profile'):
            return ConsultationNote.objects.filter(doctor=user.doctor_profile)
        return ConsultationNote.objects.filter(profile__account=user)

    def perform_create(self, serializer):
        # Only allowed if an APPROVED access grant exists — enforced here, not just in the UI.
        # Uses DRF's PermissionDenied (not the Python builtin PermissionError)
        # so this correctly returns HTTP 403 instead of a 500 server error.
        user = self.request.user
        doctor = getattr(user, 'doctor_profile', None)
        if not doctor:
            raise PermissionDenied('Only doctors can add consultation notes.')
        profile = serializer.validated_data['profile']
        has_access = DoctorPatientAccess.objects.filter(
            doctor=doctor, profile=profile, status=DoctorPatientAccess.Status.APPROVED
        ).exists()
        if not has_access:
            raise PermissionDenied('No approved access grant for this patient.')
        serializer.save(doctor=doctor)
