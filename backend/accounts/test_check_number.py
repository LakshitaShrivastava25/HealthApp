from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from . import mpin
from .models import Account

URL = '/api/auth/check-number/'


class CheckNumberTests(TestCase):
    """Login's first step: registered with a PIN -> PIN, anything else -> OTP."""

    def setUp(self):
        self.api = APIClient()

    def check(self, phone):
        return self.api.post(URL, {'phone_number': phone}, format='json')

    def test_new_number_goes_to_otp(self):
        response = self.check('+919811100001')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'next': 'otp'})
        # Looking a number up never creates an account.
        self.assertFalse(Account.objects.filter(phone_number='+919811100001').exists())

    def test_account_without_a_pin_goes_to_otp(self):
        Account.objects.create_user('+919811100002')
        self.assertEqual(self.check('+919811100002').data, {'next': 'otp'})

    def test_account_with_a_pin_goes_to_pin(self):
        account = Account.objects.create_user('+919811100003')
        mpin.set_mpin(account, '2468')
        self.assertEqual(self.check('+919811100003').data, {'next': 'pin'})

    def test_deleted_account_goes_to_otp(self):
        # verify-otp reactivates a soft-deleted account, so the code path is
        # the way back in; a PIN on a deleted account must not be offered.
        account = Account.objects.create_user('+919811100004')
        mpin.set_mpin(account, '2468')
        account.is_active = False
        account.save(update_fields=['is_active'])
        self.assertEqual(self.check('+919811100004').data, {'next': 'otp'})

    def test_says_nothing_else(self):
        account = Account.objects.create_user('+919811100005')
        mpin.set_mpin(account, '2468')
        self.assertEqual(set(self.check('+919811100005').data), {'next'})

    def test_invalid_number_is_refused(self):
        response = self.check('98111')
        self.assertEqual(response.status_code, 400)

    def test_needs_no_authentication(self):
        self.api.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
        self.assertEqual(self.check('+919811100006').status_code, 200)

    def test_is_rate_limited(self):
        # Same pattern as accounts/test_security.py: DRF reads the rates once.
        rates = {**SimpleRateThrottle.THROTTLE_RATES, 'number_check': '3/hour'}
        with mock.patch.object(SimpleRateThrottle, 'THROTTLE_RATES', rates):
            cache.clear()
            self.addCleanup(cache.clear)
            client = APIClient(REMOTE_ADDR='203.0.113.7')
            codes = [
                client.post(URL, {'phone_number': f'+91981110001{i}'}, format='json').status_code
                for i in range(4)
            ]
        self.assertEqual(codes, [200, 200, 200, 429])
