from rest_framework.routers import DefaultRouter

from .views import ConsultationNoteViewSet, DoctorPatientAccessViewSet, DoctorViewSet

router = DefaultRouter()
router.register('doctors', DoctorViewSet, basename='doctor')
router.register('doctor-access', DoctorPatientAccessViewSet, basename='doctor-access')
router.register('consultation-notes', ConsultationNoteViewSet, basename='consultation-note')

urlpatterns = router.urls
