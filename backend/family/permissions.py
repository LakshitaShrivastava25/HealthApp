from rest_framework.exceptions import PermissionDenied


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
