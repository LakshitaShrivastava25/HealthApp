import re
import uuid

from rest_framework import serializers

from family.models import Profile

from .models import ConsultationNote, Doctor, DoctorPatientAccess

# A booking number may be a mobile or a landline, so no exact digit count is
# enforced — only a sane range. Mirrors the Doctor Portal's own limits.
BOOKING_PHONE_MIN_DIGITS = 6
BOOKING_PHONE_MAX_DIGITS = 15


class DoctorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = [
            'id', 'full_name', 'specialization', 'qualification', 'experience_years',
            'license_document', 'verification_status', 'clinic_name', 'consultation_fee',
            'registration_number', 'clinic_address', 'booking_phone_number',
            'available_days', 'clinic_open_time', 'clinic_close_time',
        ]
        read_only_fields = ['id', 'verification_status']

    # What a NEW registration must supply. Enforced here rather than as a
    # database constraint: these columns are blank=True so that doctors
    # registered before these fields existed (one of whom has a blank
    # clinic_name) keep loading, and so an admin can still edit those rows
    # without being forced to invent values. self.instance is None means
    # "this is a create", so updates aren't retroactively held to it.
    REGISTRATION_REQUIRED_FIELDS = [
        'clinic_name',
        'registration_number',
        'clinic_address',
        'booking_phone_number',
    ]

    def validate(self, attrs):
        if self.instance is None:
            missing = {
                field: ['This field is required to register as a doctor.']
                for field in self.REGISTRATION_REQUIRED_FIELDS
                if not (attrs.get(field) or '').strip()
            }
            if missing:
                raise serializers.ValidationError(missing)
        return attrs

    def validate_booking_phone_number(self, value):
        """
        A booking line may be a mobile OR a landline, so its length genuinely
        varies — an Indian landline is a 2-4 digit STD code plus a 6-8 digit
        subscriber number. Enforcing one exact length (as the OTP login field
        does, because that number must receive an SMS) would reject real
        clinic numbers, so this only rejects what is obviously not a phone
        number: empty, non-numeric, or outside 6-15 national digits.
        """
        cleaned = re.sub(r'[\s\-().]', '', value or '')
        if not cleaned:
            # The registration-required check in validate() also covers this,
            # but a blank reaching here directly should not pass silently.
            raise serializers.ValidationError('Enter a booking phone number.')

        has_country_code = cleaned.startswith('+')
        digits = cleaned[1:] if has_country_code else cleaned
        if not digits.isdigit():
            raise serializers.ValidationError(
                'Enter digits only. A country code prefix like +91 is allowed.'
            )

        if has_country_code:
            # A country code is 1-4 digits. Rather than hard-coding a dial-code
            # table here that would silently drift from the frontend's country
            # list, accept the number if ANY 1-4 digit prefix leaves a valid
            # 6-15 digit national number.
            valid = any(
                BOOKING_PHONE_MIN_DIGITS <= len(digits) - cc <= BOOKING_PHONE_MAX_DIGITS
                for cc in (1, 2, 3, 4)
                if len(digits) > cc
            )
        else:
            valid = BOOKING_PHONE_MIN_DIGITS <= len(digits) <= BOOKING_PHONE_MAX_DIGITS

        if not valid:
            raise serializers.ValidationError(
                f'Enter a valid phone number — {BOOKING_PHONE_MIN_DIGITS} to '
                f'{BOOKING_PHONE_MAX_DIGITS} digits after the country code.'
            )
        return cleaned

    def validate_full_name(self, value):
        """
        Every screen that shows a doctor's name prepends "Dr. " itself, so
        a stored name that already starts with "Dr." displays as
        "Dr. Dr. Priya Nair". The Doctor Portal's registration form strips
        this client-side, but that alone can be bypassed by any other
        caller (a direct API request, the Django admin, a future second
        client) — this is the durable enforcement point, applied
        regardless of source. Same regex as the frontend, verified there
        against "Drishti"/"Drake" not being corrupted (requires a real
        period or whitespace after "dr", not just zero-or-more spaces).
        """
        stripped = re.sub(r'^dr(\.\s*|\s+)', '', value, flags=re.IGNORECASE).strip()
        if not stripped:
            # DRF's blank check runs on the raw input BEFORE this method,
            # so "Dr." alone passes that check (it isn't blank) and would
            # otherwise silently save as an empty name after stripping —
            # this makes that a clear, real validation error instead.
            raise serializers.ValidationError("Enter a name, not just \"Dr.\"")
        return stripped


DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


class AvailabilityValidationMixin:
    """
    Day-list and opening-hours rules, shared by the narrow availability
    endpoint and the full profile editor so the two can never disagree about
    what a valid week looks like.
    """

    def validate_available_days(self, value):
        if value in (None, []):
            return value
        if not isinstance(value, list):
            raise serializers.ValidationError('Expected a list of day names.')
        unknown = [d for d in value if d not in DAY_NAMES]
        if unknown:
            raise serializers.ValidationError(
                'Unknown day(s): %s. Use full names like "Monday".' % ', '.join(map(str, unknown))
            )
        # Store in week order regardless of click order, so "Fri, Mon" can
        # never be saved and then read back as a nonsensical range.
        return sorted(set(value), key=DAY_NAMES.index)

    def validate(self, attrs):
        # Read the incoming value where present, else what is already stored,
        # so a PATCH sending only one of the two times is still checked.
        opens = attrs.get('clinic_open_time', getattr(self.instance, 'clinic_open_time', None))
        closes = attrs.get('clinic_close_time', getattr(self.instance, 'clinic_close_time', None))
        if opens and closes and opens >= closes:
            raise serializers.ValidationError(
                {'clinic_close_time': 'Closing time must be after opening time.'}
            )
        return attrs


class DoctorAvailabilitySerializer(AvailabilityValidationMixin, serializers.ModelSerializer):
    """
    The only three fields a doctor may change through the availability
    endpoint. Deliberately narrow: using the full DoctorSerializer there
    would let a self-service "set my clinic hours" call also rewrite the
    doctor's name, clinic or registration number in the same request.
    """

    class Meta:
        model = Doctor
        fields = ['available_days', 'clinic_open_time', 'clinic_close_time']


class DoctorProfileUpdateSerializer(AvailabilityValidationMixin, serializers.ModelSerializer):
    """
    Everything a doctor may edit about themselves from the profile page.

    verification_status and account are absent from `fields` on purpose: the
    first is the admin's decision, the second is the login this record hangs
    off. Neither is the doctor's to set, so neither is writable here even if
    a crafted request includes it.
    """

    class Meta:
        model = Doctor
        fields = [
            'full_name', 'specialization', 'qualification', 'experience_years',
            'clinic_name', 'clinic_address', 'registration_number',
            'booking_phone_number', 'consultation_fee', 'license_document',
            'available_days', 'clinic_open_time', 'clinic_close_time',
        ]

    # Reuse the exact name and phone rules the registration serializer
    # enforces, rather than letting the profile page be a back door around
    # validation that a registering doctor has to pass.
    validate_full_name = DoctorSerializer.validate_full_name
    validate_booking_phone_number = DoctorSerializer.validate_booking_phone_number

    def update(self, instance, validated_data):
        """
        Changing registration_number sends the doctor back to the admin
        queue.

        That number is the credential an admin actually checked before
        approving. If it could be swapped afterwards, "verified" would be
        attesting to a value nobody ever reviewed — the badge would still
        say verified while pointing at an unchecked licence. Re-verification
        is the honest consequence.

        Set through validated_data rather than a second .save() so the new
        number and the reset status land in ONE write: there is no instant
        where the record holds a fresh registration number while still
        claiming to be verified.
        """
        if 'registration_number' in validated_data:
            new = (validated_data['registration_number'] or '').strip()
            old = (instance.registration_number or '').strip()
            if new != old:
                validated_data['verification_status'] = Doctor.VerificationStatus.PENDING
        return super().update(instance, validated_data)


class ProfileReferenceCodeField(serializers.PrimaryKeyRelatedField):
    """
    Accepts the patient's short reference code (e.g. "AB1234") on write and
    still emits the real UUID on read.

    Write side takes the code because that is what a patient can actually
    read aloud. Read side deliberately keeps the UUID: the User Portal's
    Doctor Access page matches grants against profile ids, so switching the
    output would silently break it.

    A raw UUID is still accepted on input too. Nothing in the app sends one
    any more, but any older client or script that does keeps working rather
    than failing with a confusing "no patient found".
    """

    default_error_messages = {
        'no_match': 'No patient found with that reference ID.',
        'invalid': 'Enter a patient reference ID, e.g. AB1234.',
    }

    def to_internal_value(self, data):
        raw = str(data or '').strip()
        if not raw:
            self.fail('invalid')

        # Case-insensitive on purpose: a doctor typing "ab1234" means the
        # same patient as "AB1234", and codes are stored uppercase.
        code = raw.upper()
        profile = Profile.objects.filter(reference_code=code).first()
        if profile is not None:
            return profile

        # UUID fallback for older callers.
        try:
            uuid.UUID(raw)
        except (ValueError, AttributeError, TypeError):
            self.fail('no_match')
        profile = Profile.objects.filter(pk=raw).first()
        if profile is None:
            self.fail('no_match')
        return profile


class DoctorPatientAccessSerializer(serializers.ModelSerializer):
    doctor_detail = serializers.SerializerMethodField()
    # Write: short code (or a legacy UUID). Read: the real UUID, unchanged.
    profile = ProfileReferenceCodeField(queryset=Profile.objects.all())

    class Meta:
        model = DoctorPatientAccess
        fields = ['id', 'doctor', 'doctor_detail', 'profile', 'status', 'requested_at', 'responded_at', 'expires_at']
        read_only_fields = ['id', 'status', 'requested_at', 'responded_at']

    def get_doctor_detail(self, obj):
        # A bare doctor UUID is useless for the patient's actual decision
        # (approve or deny a stranger asking for their medical records) —
        # they need to see who's actually asking before they can decide.
        return {
            'full_name': obj.doctor.full_name,
            'specialization': obj.doctor.specialization,
            'clinic_name': obj.doctor.clinic_name,
        }


class ConsultationNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsultationNote
        fields = ['id', 'doctor', 'profile', 'diagnosis', 'prescription', 'notes', 'follow_up_date', 'created_at']
        read_only_fields = ['id', 'doctor', 'created_at']
