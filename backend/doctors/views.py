from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.throttling import ActionThrottleMixin
from family.permissions import profile_id_param

from .access import acting_doctor, active_grants
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

    # -- no edits by id ------------------------------------------------------
    # A doctor edits their own record through /doctors/me/ (and
    # /doctors/availability/), resolved from the token. PUT/PATCH on
    # /doctors/<id>/ went through the full DoctorSerializer instead, which
    # skipped DoctorProfileUpdateSerializer's rule that a new registration
    # number, name or licence sends the doctor back for verification — a
    # verified doctor could swap credentials and keep the badge. Deleting the
    # record would strand the account as a "doctor" with no registration.
    # Admin approve/reject has its own staff-gated viewset in admin_portal.
    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed(request.method, detail='Edit your profile through /api/doctors/me/.')

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(request.method)


class DoctorPatientAccessViewSet(ActionThrottleMixin, viewsets.ModelViewSet):
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

    Which side the caller is on follows the request's mode (doctors/access.py),
    not merely whether the account has a Doctor record: a doctor in user mode
    sees and answers the requests made for their own family's profiles, and
    only those — the patient-side queryset is scoped to profiles they own.
    """
    serializer_class = DoctorPatientAccessSerializer
    permission_classes = [IsAuthenticated]
    # Read, request, and the approve/deny/revoke actions — nothing else. As a
    # full ModelViewSet this also served PUT/PATCH/DELETE, and `profile` is
    # writable for the request itself: a doctor holding one APPROVED grant
    # could PATCH it onto any other patient's reference code and walk away
    # with approved access nobody consented to. No client edits a grant.
    http_method_names = ['get', 'post', 'head', 'options']
    # Each request tries a patient reference code; a budget keeps a doctor
    # account from sweeping the code space.
    action_throttle_scopes = {'create': 'access_requests'}

    def get_queryset(self):
        doctor = acting_doctor(self.request)
        if doctor:
            qs = DoctorPatientAccess.objects.filter(doctor=doctor)
        else:
            qs = DoctorPatientAccess.objects.filter(profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        # Ordered so pagination cannot repeat or skip a request.
        return qs.order_by('-requested_at')

    def perform_create(self, serializer):
        # Only a verified doctor may initiate an access request, and only
        # for themselves — the 'doctor' field from the request body is
        # never trusted, even if the caller is a doctor, so one doctor
        # can't submit a request naming a different doctor.
        doctor = acting_doctor(self.request)
        if not doctor:
            raise PermissionDenied('Only doctors can request patient access.')
        if doctor.verification_status != Doctor.VerificationStatus.VERIFIED:
            raise PermissionDenied('Your account is not yet verified — you cannot request patient access.')
        profile = serializer.validated_data['profile']
        if DoctorPatientAccess.objects.filter(doctor=doctor, profile=profile).exists():
            raise ValidationError({'detail': 'You have already requested access to this patient.'})
        try:
            with transaction.atomic():
                serializer.save(doctor=doctor)
        except IntegrityError:
            # Two submissions racing past the check above.
            raise ValidationError({'detail': 'You have already requested access to this patient.'})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        grant = self.get_object()
        if acting_doctor(request):
            raise PermissionDenied('Only the patient can approve access to their own records.')
        grant.status = DoctorPatientAccess.Status.APPROVED
        grant.responded_at = timezone.now()
        grant.save()
        return Response(DoctorPatientAccessSerializer(grant).data)

    @action(detail=True, methods=['post'])
    def deny(self, request, pk=None):
        grant = self.get_object()
        if acting_doctor(request):
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
    # Notes are written once and read; nothing edits or deletes one. Left
    # open, PATCH let a doctor move a note onto a patient they have no grant
    # for (perform_create's check never runs on update), and let a patient
    # rewrite a doctor's diagnosis while it still carried the doctor's name.
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        doctor = acting_doctor(self.request)
        if doctor:
            return ConsultationNote.objects.filter(doctor=doctor)
        return ConsultationNote.objects.filter(profile__account=self.request.user)

    def perform_create(self, serializer):
        # Only allowed if an APPROVED access grant exists — enforced here, not just in the UI.
        # Uses DRF's PermissionDenied (not the Python builtin PermissionError)
        # so this correctly returns HTTP 403 instead of a 500 server error.
        doctor = acting_doctor(self.request)
        if not doctor:
            raise PermissionDenied('Only doctors can add consultation notes.')
        profile = serializer.validated_data['profile']
        # active_grants also requires the doctor to still be verified and the
        # grant to be unexpired — the same rule every read path applies.
        if not active_grants(doctor).filter(profile=profile).exists():
            raise PermissionDenied('No approved access grant for this patient.')
        serializer.save(doctor=doctor)
