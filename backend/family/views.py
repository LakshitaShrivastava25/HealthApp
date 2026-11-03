from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from accounts.services import request_otp, verify_otp
from ai.claude_service import ClaudeService
from config.throttling import ActionThrottleMixin
from doctors.access import acting_doctor, readable_profile_ids
from medicines.consolidation import ensure_fresh
from .models import AllergyRecord, FamilyLinkRequest, Notification, Profile
from .permissions import assert_owns_profile, profile_id_param
from .serializers import (
    AllergyRecordSerializer,
    FamilyLinkRequestSerializer,
    NotificationSerializer,
    ProfileSerializer,
)


class AskHealthQuestionSerializer(serializers.Serializer):
    # Every question is a paid AI call; a question has no business being an essay.
    question = serializers.CharField(max_length=1000)


class ProfileViewSet(ActionThrottleMixin, viewsets.ModelViewSet):
    """
    /api/profiles/ — family members under the logged-in account.
    Every other app (documents, insurance, medicines, emergency) filters
    by ?profile_id= against this table, matching the TDD's data model.

    A doctor with an APPROVED DoctorPatientAccess grant can also READ the
    patient's profile here (name, blood group, DOB, etc.) — without this,
    the Doctor Portal would have no way to show who its approved patients
    even are, since DoctorPatientAccess only stores a raw profile id.
    In doctor mode nothing here is writable and /ask/ is unavailable.

    The same account in user mode (?acting_as=patient, see doctors/access.py)
    is simply a patient: it manages its own family's profiles like any other
    account, which is what lets a doctor use CuraPath for their own health.
    """
    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]
    action_throttle_scopes = {'ask': 'ai'}

    def get_queryset(self):
        own = Profile.objects.filter(account=self.request.user)
        doctor = acting_doctor(self.request)
        if doctor:
            return (own | Profile.objects.filter(id__in=readable_profile_ids(doctor))).distinct()
        return own

    def perform_create(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot create patient profiles.")
        serializer.save(account=self.request.user)

    def perform_update(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot edit a patient's profile.")
        serializer.save()

    def perform_destroy(self, instance):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot delete a patient's profile.")
        instance.delete()

    @action(detail=True, methods=['post'], url_path='ask')
    def ask(self, request, pk=None):
        """
        POST /api/profiles/{id}/ask/ — the Dashboard's "AI Health Assistant"
        box. Grounded in this profile's own timeline/allergies, per the
        TDD's health-chat rules (see ai/claude_service.py). Patient-only —
        the AI assistant is a patient-facing feature, not a doctor tool.
        """
        if acting_doctor(request):
            raise PermissionDenied("The AI Health Assistant is a patient feature.")
        profile = self.get_object()
        ensure_fresh([profile.pk])
        serializer = AskHealthQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        context = {
            'name': profile.full_name,
            'blood_group': profile.blood_group,
            'allergies': list(profile.allergies.values_list('substance', flat=True)),
            'active_medications': [
                {
                    'name': m.name,
                    'generic_name': m.generic_name,
                    'dosage': m.dosage,
                    'frequency': m.frequency,
                    'instructions': m.instructions,
                    # One row per medicine across all prescriptions, with
                    # why it is considered current (medicines/consolidation.py).
                    'status': m.status,
                    'status_reason': m.status_reason,
                    'last_prescribed_on': m.last_prescribed_on,
                    'reminder_times': list(
                        m.reminders.filter(is_active=True).values_list('time_of_day', flat=True)
                    ),
                }
                for m in profile.medications.filter(is_active=True, merged_into__isnull=True, is_archived=False)
            ],
            'recent_documents': [
                {
                    'title': d.title,
                    'category': d.category,
                    'document_date': d.document_date,
                    'hospital_name': d.hospital_name,
                }
                for d in profile.documents.all()[:10]
            ],
            'recent_timeline_events': [
                {
                    'event_date': e.event_date,
                    'event_type': e.event_type,
                    'title': e.title,
                    'summary': e.summary,
                }
                for e in profile.timeline_events.all()[:10]
            ],
        }
        result = ClaudeService().answer_health_question(
            profile, serializer.validated_data['question'], context, history=[]
        )
        return Response(result, status=status.HTTP_200_OK)


class AllergyRecordViewSet(viewsets.ModelViewSet):
    serializer_class = AllergyRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        doctor = acting_doctor(self.request)
        if doctor:
            qs = AllergyRecord.objects.filter(profile_id__in=readable_profile_ids(doctor))
        else:
            qs = AllergyRecord.objects.filter(profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        # Stable order so pagination cannot repeat or skip an allergy.
        return qs.order_by('-recorded_at')

    def perform_create(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot add allergy records on behalf of a patient.")
        assert_owns_profile(self.request.user, serializer.validated_data.get('profile'))
        serializer.save()

    def perform_update(self, serializer):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot edit a patient's allergy records.")
        # Also checked on update: without it a record could be moved onto
        # someone else's profile by PATCHing the foreign key.
        if 'profile' in serializer.validated_data:
            assert_owns_profile(self.request.user, serializer.validated_data['profile'])
        serializer.save()

    def perform_destroy(self, instance):
        if acting_doctor(self.request):
            raise PermissionDenied("Doctors cannot delete a patient's allergy records.")
        instance.delete()


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/notifications/?profile_id=<id> — generated alerts for a profile,
    filtered by profile_id the same way documents/timeline/allergies do.

    Read-only: these rows are produced by the `generate_reminders`
    management command, never posted by a client. Unlike allergies, a
    doctor gets nothing here even for an approved patient — a premium
    renewal or a personal medicine-reminder schedule is the patient's own
    business, not clinical information a doctor needs.
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(profile__account=self.request.user)
        profile_id = profile_id_param(self.request)
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs

    @action(detail=True, methods=['post'], url_path='mark_read')
    def mark_read(self, request, pk=None):
        """POST /api/notifications/<id>/mark_read/ — flip is_read to True."""
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)


class VerifyFamilyPhoneView(APIView):
    """POST /api/family/verify-phone/ — send OTP to a family member's phone."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone = request.data.get('phone_number', '').strip()
        if not phone:
            return Response({'error': 'Phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)
        result = request_otp(phone)
        existing = Account.objects.filter(phone_number=phone).first()
        return Response({
            'ok': result.get('ok', False),
            'error': result.get('error'),
            'retry_after': result.get('retry_after'),
            'has_existing_account': existing is not None and existing.id != request.user.id,
        })


class ConfirmFamilyPhoneView(APIView):
    """POST /api/family/confirm-phone/ — verify OTP for a family member's phone."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone = request.data.get('phone_number', '').strip()
        otp = request.data.get('otp', '').strip()
        if not phone or not otp:
            return Response(
                {'error': 'Phone number and OTP are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = verify_otp(phone, otp)
        verified = result == 'ok'
        return Response({'verified': verified, 'result': result})


class CreateFamilyMemberView(APIView):
    """
    POST /api/family/create-member/ — create a family member after phone
    verification. If the phone belongs to an existing account, creates a
    FamilyLinkRequest instead.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        phone = data.get('phone_number', '').strip()
        relation = data.get('relation', '')
        full_name = data.get('full_name', '').strip()

        if not full_name:
            return Response({'error': 'Full name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        is_child = relation in ('son', 'daughter')
        if not is_child and relation != 'self' and not phone:
            return Response(
                {'error': 'Phone number is required for adult family members.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_account = None
        if phone:
            existing_account = Account.objects.filter(phone_number=phone).exclude(id=request.user.id).first()

        if existing_account:
            already = FamilyLinkRequest.objects.filter(
                from_account=request.user, to_account=existing_account, status='pending',
            ).exists()
            if already:
                return Response(
                    {'error': 'A link request to this person is already pending.'},
                    status=status.HTTP_409_CONFLICT,
                )
            link_req = FamilyLinkRequest.objects.create(
                from_account=request.user,
                to_account=existing_account,
                to_phone=phone,
                relation=relation,
                profile_data={
                    'full_name': full_name,
                    'relation': relation,
                    'date_of_birth': data.get('date_of_birth', ''),
                    'gender': data.get('gender', ''),
                    'blood_group': data.get('blood_group', ''),
                    'height_cm': data.get('height_cm'),
                    'weight_kg': data.get('weight_kg'),
                    'preferred_language': data.get('preferred_language', 'English'),
                },
            )
            return Response({
                'status': 'pending_approval',
                'message': f'This phone number belongs to an existing user. An approval request has been sent.',
                'link_request_id': str(link_req.id),
            }, status=status.HTTP_202_ACCEPTED)

        profile_fields = {
            'full_name': full_name,
            'relation': relation,
            'phone_number': phone,
            'phone_verified': bool(phone),
            'account': request.user,
        }
        for field in ('date_of_birth', 'gender', 'blood_group', 'preferred_language'):
            val = data.get(field)
            if val:
                profile_fields[field] = val
        for field in ('height_cm', 'weight_kg'):
            val = data.get(field)
            if val is not None:
                try:
                    profile_fields[field] = int(val)
                except (ValueError, TypeError):
                    pass
        profile = Profile.objects.create(**profile_fields)
        return Response(ProfileSerializer(profile).data, status=status.HTTP_201_CREATED)


class FamilyLinkRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/family/link-requests/ — pending link requests for the current user.
    ?direction=sent returns requests the user sent.
    ?direction=received (default) returns requests others sent TO the user.
    """
    serializer_class = FamilyLinkRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        direction = self.request.query_params.get('direction', 'received')
        if direction == 'sent':
            return FamilyLinkRequest.objects.filter(from_account=self.request.user)
        return FamilyLinkRequest.objects.filter(to_account=self.request.user)

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        """POST /api/family/link-requests/{id}/respond/ {action: approve|deny}"""
        link_req = self.get_object()
        if link_req.to_account != request.user:
            raise PermissionDenied('Only the recipient can respond to this request.')
        if link_req.status != 'pending':
            return Response({'error': 'This request has already been responded to.'}, status=status.HTTP_400_BAD_REQUEST)

        action_val = request.data.get('action')
        if action_val not in ('approve', 'deny'):
            return Response({'error': 'action must be "approve" or "deny".'}, status=status.HTTP_400_BAD_REQUEST)

        link_req.responded_at = timezone.now()

        if action_val == 'deny':
            link_req.status = FamilyLinkRequest.Status.DENIED
            link_req.save(update_fields=['status', 'responded_at'])
            return Response(FamilyLinkRequestSerializer(link_req).data)

        link_req.status = FamilyLinkRequest.Status.APPROVED
        pd = link_req.profile_data
        profile = Profile.objects.create(
            account=link_req.from_account,
            full_name=pd.get('full_name', ''),
            relation=pd.get('relation', 'other'),
            phone_number=link_req.to_phone,
            phone_verified=True,
            date_of_birth=pd.get('date_of_birth') or None,
            gender=pd.get('gender', ''),
            blood_group=pd.get('blood_group', ''),
            height_cm=pd.get('height_cm'),
            weight_kg=pd.get('weight_kg'),
            preferred_language=pd.get('preferred_language', 'English'),
        )
        link_req.linked_profile = profile
        link_req.save(update_fields=['status', 'responded_at', 'linked_profile'])
        return Response(FamilyLinkRequestSerializer(link_req).data)


class FamilyTreeView(APIView):
    """GET /api/family/tree/ — returns the family tree for the current user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profiles = Profile.objects.filter(account=request.user).order_by('-relation', 'created_at')
        self_profile = profiles.filter(relation='self').first()

        nodes = []
        for p in profiles:
            nodes.append({
                'id': str(p.id),
                'name': p.full_name,
                'relation': p.relation,
                'initials': ''.join(w[0] for w in p.full_name.split()[:2]).upper(),
                'phone_number': p.phone_number,
                'phone_verified': p.phone_verified,
                'gender': p.gender,
                'date_of_birth': str(p.date_of_birth) if p.date_of_birth else None,
                'blood_group': p.blood_group,
            })

        approved_links = FamilyLinkRequest.objects.filter(
            from_account=request.user, status='approved',
        ).select_related('linked_profile')

        edges = []
        if self_profile:
            for p in profiles:
                if p.relation != 'self':
                    edges.append({
                        'from': str(self_profile.id),
                        'to': str(p.id),
                        'relation': p.relation,
                    })

        for link in approved_links:
            if link.linked_profile and self_profile:
                edges.append({
                    'from': str(self_profile.id),
                    'to': str(link.linked_profile.id),
                    'relation': link.relation,
                    'cross_account': True,
                })

        return Response({
            'nodes': nodes,
            'edges': edges,
            'self_id': str(self_profile.id) if self_profile else None,
        })
