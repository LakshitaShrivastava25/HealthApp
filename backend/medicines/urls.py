from rest_framework.routers import DefaultRouter

from .views import DoseLogViewSet, MedicationViewSet, ReminderScheduleViewSet

router = DefaultRouter()
router.register('medications', MedicationViewSet, basename='medication')
router.register('reminders', ReminderScheduleViewSet, basename='reminder')
router.register('dose-logs', DoseLogViewSet, basename='dose-log')

urlpatterns = router.urls
