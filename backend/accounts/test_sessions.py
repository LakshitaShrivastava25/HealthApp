from datetime import timedelta

from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Account


class SessionLifetimeTests(APITestCase):
    """Sessions end after 30 days of inactivity, and logout ends them server-side."""

    def setUp(self):
        self.account = Account.objects.create_user(phone_number='+919000000777')
        self.refresh = RefreshToken.for_user(self.account)

    def _refresh(self, token):
        return self.client.post('/api/auth/refresh/', {'refresh': str(token)}, format='json')

    def test_refresh_token_lasts_30_days(self):
        lifetime = self.refresh['exp'] - self.refresh['iat']
        self.assertEqual(lifetime, timedelta(days=30).total_seconds())

    def test_refresh_rotates_to_a_fresh_30_day_token(self):
        response = self._refresh(self.refresh)
        self.assertEqual(response.status_code, 200)
        rotated = RefreshToken(response.json()['refresh'])
        self.assertEqual(rotated['exp'] - rotated['iat'], timedelta(days=30).total_seconds())
        self.assertNotEqual(str(rotated), str(self.refresh))

    def test_replaced_refresh_token_is_rejected(self):
        self.assertEqual(self._refresh(self.refresh).status_code, 200)
        self.assertEqual(self._refresh(self.refresh).status_code, 401)

    def test_logout_blacklists_the_refresh_token(self):
        response = self.client.post('/api/auth/logout/', {'refresh': str(self.refresh)}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._refresh(self.refresh).status_code, 401)
