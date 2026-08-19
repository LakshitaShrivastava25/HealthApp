from .models import AuditLog


class AuditLogMixin:
    """Mix into any staff-facing ViewSet — logs every write with who/what/when."""
    audit_target_type = 'unknown'

    def _log(self, request, action, obj):
        AuditLog.objects.create(
            staff=request.user,
            action=action,
            target_type=self.audit_target_type,
            target_id=str(getattr(obj, 'pk', '')),
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        self._log(self.request, 'update', instance)

    def perform_destroy(self, instance):
        self._log(self.request, 'delete', instance)
        instance.delete()
