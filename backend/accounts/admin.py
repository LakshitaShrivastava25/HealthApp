from django.contrib import admin
from .models import Account, OTPRequest

admin.site.register(Account)
admin.site.register(OTPRequest)
