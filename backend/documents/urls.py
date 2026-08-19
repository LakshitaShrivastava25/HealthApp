from rest_framework.routers import DefaultRouter

from .views import DocumentViewSet, TimelineEventViewSet

router = DefaultRouter()
router.register('documents', DocumentViewSet, basename='document')
router.register('timeline', TimelineEventViewSet, basename='timeline')

urlpatterns = router.urls
