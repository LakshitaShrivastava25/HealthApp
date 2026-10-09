import uuid

from rest_framework.exceptions import PermissionDenied, ValidationError


def assert_owns_profile(user, profile):
    """
    Every medical record in this system hangs off a Profile, and the client
    supplies that profile id in the request body. Until this existed nothing
    checked it, so any authenticated caller could write records into any
    profile whose id they knew — and that id is not a secret: the patient
    app displays it as the "Patient Reference ID" and tells people to hand
    it to their doctor.

    Read paths were already scoped by account in every get_queryset. This is
    the matching guard for the write paths, applied at the point where the
    submitted profile is known and before anything is saved.
    """
    if profile is None or profile.account_id != user.id:
        raise PermissionDenied('That profile does not belong to this account.')


def profile_id_param(request):
    """
    The ?profile_id= filter as a canonical UUID string, or None when absent.

    Passed straight into a queryset filter, a malformed value raised a
    Django ValidationError that DRF does not handle — a 500 for what is a
    bad request.
    """
    raw = request.query_params.get('profile_id')
    if not raw:
        return None
    try:
        return str(uuid.UUID(str(raw)))
    except ValueError:
        raise ValidationError({'profile_id': 'Not a valid profile id.'})

