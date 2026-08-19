from rest_framework.permissions import BasePermission

from accounts.models import Account


class IsStaffAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == Account.Role.ADMIN)


class IsOCRReviewer(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            request.user.role in [Account.Role.ADMIN, Account.Role.OCR_REVIEWER]
        )


class IsClaimsOps(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            request.user.role in [Account.Role.ADMIN, Account.Role.CLAIMS_OPS]
        )
