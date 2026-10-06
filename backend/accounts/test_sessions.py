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


class AccountDeletionTests(APITestCase):
    """Settings → Delete account stops everything the account had shared."""

    def setUp(self):
        from doctors.models import Doctor, DoctorPatientAccess
        from emergency.models import EmergencyProfile
        from family.models import Profile

        self.account = Account.objects.create_user('+919800000101')
        profile = Profile.objects.create(account=self.account, full_name='Asha Rao')
        doctor = Doctor.objects.create(
            account=Account.objects.create_user('+919800000102'), full_name='Mehta',
            specialization='Cardiology', verification_status=Doctor.VerificationStatus.VERIFIED,
        )
        self.grant = DoctorPatientAccess.objects.create(
            doctor=doctor, profile=profile, status=DoctorPatientAccess.Status.APPROVED,
        )
        self.card = EmergencyProfile.objects.create(profile=profile)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(self.account).access_token))

    def test_delete_deactivates_and_revokes_sharing(self):
        card_url = f'/api/public/emergency/{self.card.public_token}/?format=json'
        self.assertEqual(self.client.get(card_url).status_code, 200)

        self.assertEqual(self.client.delete('/api/auth/me/').status_code, 204)

        self.account.refresh_from_db()
        self.grant.refresh_from_db()
        self.card.refresh_from_db()
        self.assertFalse(self.account.is_active)
        self.assertEqual(self.grant.status, self.grant.Status.REVOKED)
        self.assertIsNotNone(self.card.revoked_at)
        self.assertEqual(self.client.get(card_url).status_code, 404)

    def test_card_of_disabled_account_stops_resolving(self):
        # e.g. an admin disabling the account, which doesn't revoke the card itself.
        Account.objects.filter(pk=self.account.pk).update(is_active=False)
        r = self.client.get(f'/api/public/emergency/{self.card.public_token}/?format=json')
        self.assertEqual(r.status_code, 404)
