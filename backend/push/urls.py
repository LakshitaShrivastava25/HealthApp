from django.urls import path

from .views import PushDeviceView

urlpatterns = [
    path('push-devices/', PushDeviceView.as_view(), name='push-devices'),
]
