from rest_framework.routers import DefaultRouter

from .views import AllergyRecordViewSet, NotificationViewSet, ProfileViewSet

router = DefaultRouter()
router.register('profiles', ProfileViewSet, basename='profile')
router.register('allergies', AllergyRecordViewSet, basename='allergy')
router.register('notifications', NotificationViewSet, basename='notification')

urlpatterns = router.urls
