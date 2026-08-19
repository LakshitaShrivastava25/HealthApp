from django.contrib import admin
from .models import Document, TimelineEvent

admin.site.register(Document)
admin.site.register(TimelineEvent)
