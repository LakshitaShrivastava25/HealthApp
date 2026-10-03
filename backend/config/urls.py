from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

from documents.files import serve_stored_file

urlpatterns = [
    path('admin/', admin.site.urls),

    path('api/auth/', include('accounts.urls')),
    path('api/auth/', include('push.urls')),
    path('api/', include('family.urls')),
    path('api/', include('documents.urls')),
    path('api/', include('insurance.urls')),
    path('api/', include('medicines.urls')),
    path('api/', include('emergency.urls')),  # also exposes /api/public/emergency/<token>/ (mounted under this same api/ prefix — not a bare /public/... path)
    path('api/', include('doctors.urls')),
    path('api/admin/', include('admin_portal.urls')),
    path('api/files/', serve_stored_file, name='stored-file'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
