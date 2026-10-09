"""
Which side of a dual-role account a request is acting for.

One login can be both a patient (their own family's records) and a doctor
(other people's records, by consent) — the apps register a doctor from the
same account a patient signs in with, then offer a User / Doctor switch.
The two sides must never blur: as a patient the account manages only its
own profiles; as a doctor it may only READ profiles whose owners approved
access. Rather than guess from the account, each client states which mode
the screen making the request is in:

    ?acting_as=patient   the account's own records, full control
    ?acting_as=doctor    approved patients' records, read-only

A query parameter rather than a custom header on purpose: a header would
need adding to the CORS allow-list, and a web build deployed before this
backend would then fail every request at the preflight. An older backend
simply ignores an unknown query parameter.

Without the parameter the old rule applies — a Doctor record means doctor
mode — so app builds already installed keep behaving exactly as before.

The parameter only ever chooses between two sets of permissions the
account already holds, so a client cannot widen its access by lying:
patient mode sees nothing but the account's own profiles, and doctor mode
is unavailable to an account without a Doctor record.
"""

from django.db.models import Q
from django.utils import timezone

ACTING_AS_PARAM = 'acting_as'
PATIENT = 'patient'
DOCTOR = 'doctor'


def acting_doctor(request):
    """The caller's Doctor record when this request acts as a doctor, else None."""
    doctor = getattr(request.user, 'doctor_profile', None)
    if doctor is None:
        return None
    params = getattr(request, 'query_params', request.GET)
    if (params.get(ACTING_AS_PARAM) or '').strip().lower() == PATIENT:
        return None
    return doctor


def active_grants(doctor):
    """
    The grants that let this doctor read a patient right now.

    APPROVED alone is not enough. The grant must not have passed its
    expires_at, and the doctor must still be verified: editing the
    registration number sends a doctor back to pending, and an admin can
    reject one. Without the verification check here, only the web portal's
    route gate kept an unverified doctor away from records they had been
    granted earlier — the API itself kept serving them.
    """
    from .models import Doctor, DoctorPatientAccess

    if doctor is None or doctor.verification_status != Doctor.VerificationStatus.VERIFIED:
        return DoctorPatientAccess.objects.none()
    return DoctorPatientAccess.objects.filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()),
        doctor=doctor,
        status=DoctorPatientAccess.Status.APPROVED,
    )


def readable_profile_ids(doctor):
    """Profile ids this doctor may currently read, as a subquery."""
    return active_grants(doctor).values_list('profile_id', flat=True)
