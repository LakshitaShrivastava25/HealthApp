from django.contrib import admin
from .models import Document, DocumentUpload, TimelineEvent

admin.site.register(Document)
admin.site.register(DocumentUpload)
admin.site.register(TimelineEvent)
