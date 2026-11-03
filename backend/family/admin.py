from django.contrib import admin
from .models import AllergyRecord, FamilyLinkRequest, Profile

admin.site.register(Profile)
admin.site.register(AllergyRecord)
admin.site.register(FamilyLinkRequest)
