from rest_framework.routers import DefaultRouter

from .views import ClaimEstimateViewSet, InsurancePolicyViewSet

router = DefaultRouter()
router.register('insurance', InsurancePolicyViewSet, basename='insurance-policy')
router.register('claims', ClaimEstimateViewSet, basename='claim-estimate')

urlpatterns = router.urls
