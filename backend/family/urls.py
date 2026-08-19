from rest_framework.routers import DefaultRouter

from .views import AllergyRecordViewSet, ProfileViewSet

router = DefaultRouter()
router.register('profiles', ProfileViewSet, basename='profile')
router.register('allergies', AllergyRecordViewSet, basename='allergy')

urlpatterns = router.urls
