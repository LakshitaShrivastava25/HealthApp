from django.conf import settings
from rest_framework.permissions import BasePermission

from accounts.models import Account


def _is_allowed_staff(user, roles):
    """
    Staff access needs BOTH the right role and a phone number on the
    ADMIN_PHONE_NUMBERS list, so changing a role in the database is not
    enough on its own to open the Admin Portal.
    """
    return bool(
        user and user.is_authenticated
        and user.role in roles
        and user.phone_number in settings.ADMIN_PHONE_NUMBERS
    )


class IsStaffAdmin(BasePermission):
    def has_permission(self, request, view):
        return _is_allowed_staff(request.user, [Account.Role.ADMIN])


class IsOCRReviewer(BasePermission):
    def has_permission(self, request, view):
        return _is_allowed_staff(request.user, [Account.Role.ADMIN, Account.Role.OCR_REVIEWER])


class IsClaimsOps(BasePermission):
    def has_permission(self, request, view):
        return _is_allowed_staff(request.user, [Account.Role.ADMIN, Account.Role.CLAIMS_OPS])
