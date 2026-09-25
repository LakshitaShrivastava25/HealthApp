from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ConsultationNote, Doctor, DoctorPatientAccess
from .serializers import (
    ConsultationNoteSerializer, DoctorAvailabilitySerializer, PublicDoctorSerializer,
    DoctorPatientAccessSerializer, DoctorProfileUpdateSerializer, DoctorSerializer,
)


class DoctorViewSet(viewsets.ModelViewSet):
    """
    /api/doctors/ — registration creates a Doctor row with verification_status=pending.
    Admin Portal approves/rejects (see admin_portal app). Doctors can't log in
    to the Doctor Portal meaningfully until verified.
    """
    serializer_class = DoctorSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        # Browsing the directory returns the patient-facing shape, which
        # omits registration_number and license_document. Registration and
        # the self-service /me/ endpoints keep the full serializer, since a
        # doctor does submit and read their own credentials.
        if self.action in ('list', 'retrieve'):
            return PublicDoctorSerializer
        return DoctorSerializer

    def get_queryset(self):
        # An unverified registration is not something to advertise, and
        # Find Care already discards anything that isn't verified — doing it
        # here means the data never leaves the server in the first place.
        # A doctor's own record stays visible to them whatever its status,
        # so a pending or rejected account can still load itself.
        verified = Doctor.objects.filter(verification_status=Doctor.VerificationStatus.VERIFIED)
        own = Doctor.objects.filter(account=self.request.user)
        # Ordered explicitly: PageNumberPagination over an unordered
        # queryset may repeat a row on one page and drop another, since
        # the database is free to order each query differently.
        return (verified | own).distinct().order_by('full_name')

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

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        """
        GET   /api/doctors/me/ — the logged-in doctor's own record.
        PATCH /api/doctors/me/ — that same doctor edits their own profile.

        detail=False for both, which is the whole security story: the record
        is resolved from the caller's token and there is no id in the URL to
        aim at anyone else, so editing another doctor is impossible by
        construction rather than by a check that could later be removed.

        404 if this account has no Doctor record yet (hasn't registered).
        """
        doctor = getattr(request.user, 'doctor_profile', None)
        if not doctor:
            return Response({'detail': 'No doctor profile for this account.'}, status=404)

        if request.method == 'PATCH':
            serializer = DoctorProfileUpdateSerializer(doctor, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            doctor.refresh_from_db()

        # Always answer with the full record so the client re-renders from
        # what was actually stored, including a verification_status the
        # serializer may have reset.
        return Response(DoctorSerializer(doctor).data)

    @action(detail=False, methods=['patch'], url_path='availability')
    def availability(self, request):
        """
        PATCH /api/doctors/availability/ — the logged-in doctor sets their
        own clinic days and hours.

        detail=False on purpose: the record is resolved from the caller's own
        account, so there is no id in the URL to point at somebody else. That
        makes editing another doctor's availability impossible by
        construction rather than by a check that could later be dropped.
        """
        doctor = getattr(request.user, 'doctor_profile', None)
        if not doctor:
            return Response({'detail': 'No doctor profile for this account.'}, status=404)
        serializer = DoctorAvailabilitySerializer(doctor, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(DoctorSerializer(doctor).data)

    # -- ownership guards -------------------------------------------------
    # This viewset is IsAuthenticated over every verified doctor, so without
    # these any logged-in account — including a patient — could PATCH or
    # DELETE another doctor's record by id. Admin approve/reject goes through
    # admin_portal's own staff-gated viewset, so nothing legitimate needs
    # write access here except a doctor editing themselves.
    def _assert_own_record(self, instance):
        if instance.account_id != self.request.user.id:
            raise PermissionDenied("You can only edit your own doctor record.")

    def perform_update(self, serializer):
        self._assert_own_record(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._assert_own_record(instance)
        instance.delete()


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
