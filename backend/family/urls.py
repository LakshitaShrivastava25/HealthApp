from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AllergyRecordViewSet,
    ConfirmFamilyPhoneView,
    CreateFamilyMemberView,
    FamilyLinkRequestViewSet,
    FamilyTreeView,
    NotificationViewSet,
    ProfileViewSet,
    VerifyFamilyPhoneView,
)

router = DefaultRouter()
router.register('profiles', ProfileViewSet, basename='profile')
router.register('allergies', AllergyRecordViewSet, basename='allergy')
router.register('notifications', NotificationViewSet, basename='notification')
router.register('link-requests', FamilyLinkRequestViewSet, basename='link-request')

urlpatterns = router.urls + [
    path('verify-phone/', VerifyFamilyPhoneView.as_view(), name='verify-family-phone'),
    path('confirm-phone/', ConfirmFamilyPhoneView.as_view(), name='confirm-family-phone'),
    path('create-member/', CreateFamilyMemberView.as_view(), name='create-family-member'),
    path('tree/', FamilyTreeView.as_view(), name='family-tree'),
]
