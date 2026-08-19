from django.contrib import admin
from .models import (
    ClaimEstimate, InsuranceChatMessage, InsurancePolicy,
    PolicyExclusion, PolicySubLimit, PolicyWaitingPeriod,
)

admin.site.register(InsurancePolicy)
admin.site.register(PolicyExclusion)
admin.site.register(PolicyWaitingPeriod)
admin.site.register(PolicySubLimit)
admin.site.register(ClaimEstimate)
admin.site.register(InsuranceChatMessage)
