from django.contrib import admin, messages

from .models import Account, OTPConfig, OTPRequest, StaffCredential

admin.site.register(Account)
admin.site.register(OTPRequest)


@admin.register(StaffCredential)
class StaffCredentialAdmin(admin.ModelAdmin):
    """Admin Portal email sign-ins. Passwords are set with `manage.py set_staff_login`, never here."""
    list_display = ('email', 'account', 'last_login_at', 'locked_until', 'password_changed_at')
    exclude = ('password',)
    readonly_fields = ('account', 'email', 'last_login_at', 'password_changed_at', 'failed_attempts')

    def has_add_permission(self, request):
        return False


@admin.register(OTPConfig)
class OTPConfigAdmin(admin.ModelAdmin):
    """
    The OTP mode switch. Also exposed at /api/admin/otp-settings/ for the
    web and mobile admin portals. Singleton: no add (once it exists), no delete.
    """
    list_display = ('__str__', 'mode', 'master_otp', 'updated_at', 'updated_by')
    list_editable = ('mode',)
    list_display_links = ('__str__',)
    readonly_fields = ('updated_at', 'updated_by')
    actions = ['use_master_otp', 'use_sms_otp']

    def has_add_permission(self, request):
        return not OTPConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        OTPConfig.load()  # so the row is always there to click
        return super().get_queryset(request)

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)

    def _switch(self, request, mode):
        config = OTPConfig.load()
        config.mode = mode
        config.updated_by = request.user
        config.save()
        self.message_user(request, f'OTP mode is now: {config.get_mode_display()}', messages.SUCCESS)

    @admin.action(description='Switch to MASTER OTP (no SMS)')
    def use_master_otp(self, request, queryset):
        self._switch(request, OTPConfig.Mode.MASTER)

    @admin.action(description='Switch to SMS OTP (2Factor)')
    def use_sms_otp(self, request, queryset):
        self._switch(request, OTPConfig.Mode.SMS)
