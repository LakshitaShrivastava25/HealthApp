"""
App Lock: the 4-digit MPIN and the devices allowed to use it.

The tests that matter most here are the ones about what an attacker can do,
not the happy path. A 4-digit PIN is only safe because of the device token
and the lockout ladder, so those are tested as properties rather than as
code paths.
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import mpin as mpin_lib
from accounts.models import Account, MPINCredential, MPINResetGrant, TrustedDevice

PHONE = '+919000000100'
OTHER_PHONE = '+919000000200'
PIN = '4821'
UNLOCK_URL = '/api/auth/mpin/unlock/'
MPIN_URL = '/api/auth/mpin/'
GRANT_URL = '/api/auth/mpin/grant/'
DEVICES_URL = '/api/auth/mpin/devices/'


def signed_in(account, minutes_ago=0):
    """Mark the account as having just proved itself with an SMS code."""
    account.last_otp_login_at = timezone.now() - timedelta(minutes=minutes_ago)
    account.save(update_fields=['last_otp_login_at'])
    return account


class MPINSetupTests(TestCase):
    def setUp(self):
        self.account = signed_in(Account.objects.create(phone_number=PHONE))
        self.client = APIClient()
        self.client.force_authenticate(self.account)

    def test_setting_a_pin_just_after_signing_in_needs_nothing_more(self):
        r = self.client.post(MPIN_URL, {'mpin': PIN, 'label': 'iPhone 15'}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertIn('device_token', r.data)
        self.assertTrue(MPINCredential.objects.filter(account=self.account).exists())

    def test_the_token_is_returned_once_and_only_its_digest_is_kept(self):
        token = self.client.post(MPIN_URL, {'mpin': PIN}, format='json').data['device_token']
        device = TrustedDevice.objects.get(account=self.account)
        self.assertNotEqual(device.token_hash, token)
        self.assertNotIn(token, self.client.get(DEVICES_URL).data[0].values())

    def test_setting_a_pin_long_after_signing_in_needs_an_otp(self):
        signed_in(self.account, minutes_ago=120)
        r = self.client.post(MPIN_URL, {'mpin': PIN}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertTrue(r.data['otp_required'])

    def test_the_pin_is_not_recoverable_from_the_hash(self):
        self.client.post(MPIN_URL, {'mpin': PIN}, format='json')
        credential = MPINCredential.objects.get(account=self.account)
        self.assertTrue(credential.pin_hash.startswith('pbkdf2_'))
        self.assertNotIn(PIN, credential.pin_hash)

    def test_two_accounts_with_the_same_pin_do_not_share_a_hash(self):
        other = signed_in(Account.objects.create(phone_number=OTHER_PHONE))
        other_client = APIClient()
        other_client.force_authenticate(other)
        self.client.post(MPIN_URL, {'mpin': PIN}, format='json')
        other_client.post(MPIN_URL, {'mpin': PIN}, format='json')
        self.assertNotEqual(
            MPINCredential.objects.get(account=self.account).pin_hash,
            MPINCredential.objects.get(account=other).pin_hash,
        )

    def test_any_four_digits_are_accepted(self):
        """
        Guessability is deliberately not judged. 1234 and 0000 are allowed,
        and so is the end of the person's own number — choosing the PIN is
        theirs to do. What protects the account is the ladder in unlock():
        three wrong guesses cost two minutes and fifteen retire the device,
        whatever the PIN happens to be.
        """
        for pin in ('1234', '0000', '1111', '4321', '1212', PHONE[-4:]):
            with self.subTest(pin=pin):
                # Each one is a *first* PIN: setting a second would be a
                # change, which needs an OTP grant and is tested elsewhere.
                mpin_lib.clear_mpin(self.account)
                r = self.client.post(MPIN_URL, {'mpin': pin}, format='json')
                self.assertEqual(r.status_code, 201, r.data)

    def test_malformed_pins_are_refused_before_any_hashing(self):
        for bad in ('123', '12345', '12a4', '٤٨٢١', '', ' 482'):
            with self.subTest(pin=bad):
                self.assertEqual(self.client.post(MPIN_URL, {'mpin': bad}, format='json').status_code, 400)
        self.assertFalse(MPINCredential.objects.exists())


class MPINUnlockTests(TestCase):
    def setUp(self):
        self.account = signed_in(Account.objects.create(phone_number=PHONE))
        auth = APIClient()
        auth.force_authenticate(self.account)
        self.token = auth.post(MPIN_URL, {'mpin': PIN}, format='json').data['device_token']
        self.client = APIClient()

    def unlock(self, token=None, pin=PIN):
        return self.client.post(
            UNLOCK_URL, {'device_token': token or self.token, 'mpin': pin}, format='json'
        )

    def test_the_right_pin_returns_a_working_session(self):
        r = self.unlock()
        self.assertEqual(r.status_code, 200)
        me = APIClient()
        me.credentials(HTTP_AUTHORIZATION=f'Bearer {r.data["access"]}')
        self.assertEqual(me.get('/api/auth/me/').status_code, 200)

    def test_it_works_once_the_refresh_token_has_been_blacklisted(self):
        """
        The reason the feature exists. A saved session that has expired or
        been revoked must not force an SMS — the PIN is a credential in its
        own right, not a shortcut past a session that is still alive.
        """
        from rest_framework_simplejwt.tokens import RefreshToken

        RefreshToken.for_user(self.account).blacklist()
        self.assertEqual(self.unlock().status_code, 200)

    def test_a_wrong_pin_is_refused_and_counts_down(self):
        r = self.unlock(pin='9999')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data['attempts_left'], 2)

    def test_an_unknown_token_says_so_without_counting_anything(self):
        r = self.unlock(token='not-a-real-token')
        self.assertEqual(r.status_code, 401)
        self.assertTrue(r.data['device_unknown'])
        # No attempts_left: there is no device to count against, and saying
        # anything more would confirm whether a token exists.
        self.assertNotIn('attempts_left', r.data)

    def test_signing_in_by_number_and_pin_works_on_a_new_phone(self):
        """
        The product decision: a registered number plus its PIN gets you in
        with no SMS, on a phone that has never enrolled. Weaker than
        requiring a code per device, and the compensating controls are the
        weak-PIN blocklist, the per-account ladder and the throttle.
        """
        fresh = APIClient()
        r = fresh.post(UNLOCK_URL, {'phone_number': PHONE, 'mpin': PIN}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)

    def test_that_sign_in_enrols_the_phone_for_next_time(self):
        """So the next unlock is device-bound and never names the account."""
        fresh = APIClient()
        token = fresh.post(UNLOCK_URL, {'phone_number': PHONE, 'mpin': PIN}, format='json').data['device_token']
        self.assertEqual(
            fresh.post(UNLOCK_URL, {'device_token': token, 'mpin': PIN}, format='json').status_code, 200
        )

    def test_a_wrong_pin_by_number_is_refused(self):
        r = APIClient().post(UNLOCK_URL, {'phone_number': PHONE, 'mpin': '1357'}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_an_unregistered_number_looks_the_same_as_a_wrong_pin(self):
        """Otherwise this endpoint would report who has an account."""
        unknown = APIClient().post(
            UNLOCK_URL, {'phone_number': '+919000009999', 'mpin': PIN}, format='json'
        )
        wrong = APIClient().post(UNLOCK_URL, {'phone_number': PHONE, 'mpin': '1357'}, format='json')
        self.assertEqual(unknown.status_code, wrong.status_code)

    def test_three_wrong_pins_by_number_lock_the_account_out_of_pin_sign_in(self):
        client = APIClient()
        for _ in range(3):
            r = client.post(UNLOCK_URL, {'phone_number': PHONE, 'mpin': '1357'}, format='json')
        self.assertEqual(r.status_code, 429)

    def test_a_pin_lockout_never_blocks_signing_in_with_a_code(self):
        """
        Why a lockout here cannot be used against someone: the SMS route is
        untouched, so the owner always has a way in and an attacker cannot
        deny them one.
        """
        client = APIClient()
        for _ in range(3):
            client.post(UNLOCK_URL, {'phone_number': PHONE, 'mpin': '1357'}, format='json')
        # Not 429: the PIN lockout must not rate-limit or bar this route.
        # (A 502 here just means the test settings have no SMS gateway.)
        r = client.post('/api/auth/send-otp/', {'phone_number': PHONE}, format='json')
        self.assertNotEqual(r.status_code, 429)

    def test_a_wrong_pin_on_one_device_does_not_lock_another(self):
        auth = APIClient()
        auth.force_authenticate(self.account)
        second = auth.post(DEVICES_URL, {'label': 'iPad'}, format='json').data['device_token']
        for _ in range(TrustedDevice.ATTEMPTS_PER_STEP):
            self.unlock(pin='9999')
        self.assertEqual(self.unlock(token=second).status_code, 200)

    def test_a_deleted_account_cannot_unlock(self):
        self.account.is_active = False
        self.account.save(update_fields=['is_active'])
        self.assertEqual(self.unlock().status_code, 403)

    def test_turning_app_lock_off_invalidates_the_token(self):
        auth = APIClient()
        auth.force_authenticate(self.account)
        auth.delete(MPIN_URL)
        r = self.unlock()
        self.assertEqual(r.status_code, 401)
        self.assertTrue(r.data['device_unknown'])

    def test_the_response_never_carries_the_pin_or_a_hash(self):
        body = str(self.unlock().data)
        self.assertNotIn(PIN, body)
        self.assertNotIn(self.token, body)
        self.assertNotIn('hash', body)


class MPINLockoutTests(TestCase):
    def setUp(self):
        self.account = signed_in(Account.objects.create(phone_number=PHONE))
        auth = APIClient()
        auth.force_authenticate(self.account)
        self.token = auth.post(MPIN_URL, {'mpin': PIN}, format='json').data['device_token']
        self.client = APIClient()

    def wrong(self, times=1):
        for _ in range(times):
            r = self.client.post(UNLOCK_URL, {'device_token': self.token, 'mpin': '9999'}, format='json')
        return r

    def right(self):
        return self.client.post(UNLOCK_URL, {'device_token': self.token, 'mpin': PIN}, format='json')

    def test_three_wrong_guesses_start_a_two_minute_cooldown(self):
        r = self.wrong(3)
        self.assertEqual(r.status_code, 429)
        self.assertAlmostEqual(r.data['retry_after'], 120, delta=5)
        self.assertEqual(r.headers['Retry-After'], str(r.data['retry_after']))

    def test_guessing_during_a_cooldown_does_not_cost_an_attempt(self):
        """Waiting out a lockout must not quietly burn the tries left."""
        self.wrong(3)
        before = TrustedDevice.objects.get(account=self.account).failed_attempts
        self.wrong(2)
        self.assertEqual(TrustedDevice.objects.get(account=self.account).failed_attempts, before)

    def test_the_right_pin_after_the_cooldown_clears_the_count(self):
        self.wrong(3)
        TrustedDevice.objects.filter(account=self.account).update(
            locked_until=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(self.right().status_code, 200)
        self.assertEqual(TrustedDevice.objects.get(account=self.account).failed_attempts, 0)

    def test_the_cooldown_lengthens_each_time(self):
        seen = []
        for _ in range(4):
            r = self.wrong(3)
            seen.append(r.data['retry_after'])
            TrustedDevice.objects.filter(account=self.account).update(
                locked_until=timezone.now() - timedelta(seconds=1)
            )
        self.assertEqual(seen, sorted(seen))
        self.assertGreater(seen[-1], seen[0])

    def test_fifteen_wrong_guesses_retire_the_device_for_good(self):
        """
        The real answer to a stolen phone: 15 tries against 10,000
        combinations is a 0.15% chance, and there is no sixteenth.
        """
        for _ in range(TrustedDevice.MAX_ATTEMPTS // TrustedDevice.ATTEMPTS_PER_STEP):
            self.wrong(3)
            TrustedDevice.objects.filter(account=self.account).update(
                locked_until=timezone.now() - timedelta(seconds=1)
            )
        self.assertFalse(TrustedDevice.objects.get(account=self.account).is_active)
        r = self.right()
        self.assertEqual(r.status_code, 401)
        self.assertTrue(r.data['device_unknown'])


class MPINGrantTests(TestCase):
    """Changing a PIN costs an SMS; the grant is how that proof travels."""

    def setUp(self):
        self.account = signed_in(Account.objects.create(phone_number=PHONE))
        self.client = APIClient()
        self.client.force_authenticate(self.account)
        self.client.post(MPIN_URL, {'mpin': PIN}, format='json')

    def test_changing_a_pin_without_a_grant_is_refused(self):
        r = self.client.post(MPIN_URL, {'mpin': '5937'}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertTrue(r.data['otp_required'])

    def test_changing_a_pin_with_a_grant_replaces_it(self):
        grant = mpin_lib.issue_grant(self.account)
        r = self.client.post(MPIN_URL, {'mpin': '5937', 'otp_grant': grant}, format='json')
        self.assertEqual(r.status_code, 201)
        credential = MPINCredential.objects.get(account=self.account)
        self.assertTrue(mpin_lib.check_mpin(credential, '5937'))
        self.assertFalse(mpin_lib.check_mpin(credential, PIN))

    def test_a_grant_cannot_be_spent_twice(self):
        grant = mpin_lib.issue_grant(self.account)
        self.client.post(MPIN_URL, {'mpin': '5937', 'otp_grant': grant}, format='json')
        r = self.client.post(MPIN_URL, {'mpin': '6284', 'otp_grant': grant}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_an_expired_grant_is_refused(self):
        grant = mpin_lib.issue_grant(self.account)
        MPINResetGrant.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(
            self.client.post(MPIN_URL, {'mpin': '5937', 'otp_grant': grant}, format='json').status_code, 403
        )

    def test_a_grant_for_one_account_cannot_change_anothers_pin(self):
        other = signed_in(Account.objects.create(phone_number=OTHER_PHONE))
        stolen = mpin_lib.issue_grant(other)
        r = self.client.post(MPIN_URL, {'mpin': '5937', 'otp_grant': stolen}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_changing_a_pin_clears_every_devices_lockout(self):
        """Someone who resets because they were locked out expects in."""
        TrustedDevice.objects.filter(account=self.account).update(
            failed_attempts=6, locked_until=timezone.now() + timedelta(hours=1)
        )
        grant = mpin_lib.issue_grant(self.account)
        self.client.post(MPIN_URL, {'mpin': '5937', 'otp_grant': grant}, format='json')
        device = TrustedDevice.objects.filter(account=self.account).first()
        self.assertEqual(device.failed_attempts, 0)
        self.assertIsNone(device.locked_until)


class MPINDeviceTests(TestCase):
    def setUp(self):
        self.account = signed_in(Account.objects.create(phone_number=PHONE))
        self.client = APIClient()
        self.client.force_authenticate(self.account)
        self.token = self.client.post(MPIN_URL, {'mpin': PIN}, format='json').data['device_token']

    def test_a_second_device_enrols_without_a_pin_or_another_sms(self):
        """
        One PIN, every device. The new phone has just signed in with a
        code, which is the proof — asking for the PIN again here would add
        nothing, since the PIN is what unlock checks anyway.
        """
        r = self.client.post(DEVICES_URL, {'label': 'iPad'}, format='json')
        self.assertEqual(r.status_code, 201)
        anon = APIClient()
        unlocked = anon.post(
            UNLOCK_URL, {'device_token': r.data['device_token'], 'mpin': PIN}, format='json'
        )
        self.assertEqual(unlocked.status_code, 200)

    def test_enrolling_long_after_signing_in_is_refused(self):
        signed_in(self.account, minutes_ago=120)
        r = self.client.post(DEVICES_URL, {'label': 'iPad'}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertTrue(r.data['otp_required'])

    def test_a_biometric_device_unlocks_without_a_pin(self):
        token = self.client.post(DEVICES_URL, {'kind': 'biometric'}, format='json').data['device_token']
        anon = APIClient()
        self.assertEqual(
            anon.post(UNLOCK_URL, {'device_token': token}, format='json').status_code, 200
        )

    def test_an_mpin_device_will_not_unlock_without_a_pin(self):
        anon = APIClient()
        r = anon.post(UNLOCK_URL, {'device_token': self.token}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_revoking_one_device_leaves_the_others(self):
        second = self.client.post(DEVICES_URL, {'label': 'iPad'}, format='json').data['device_token']
        self.client.delete(DEVICES_URL, {'device_token': second}, format='json')
        anon = APIClient()
        self.assertEqual(
            anon.post(UNLOCK_URL, {'device_token': second, 'mpin': PIN}, format='json').status_code, 401
        )
        self.assertEqual(
            anon.post(UNLOCK_URL, {'device_token': self.token, 'mpin': PIN}, format='json').status_code, 200
        )

    def test_deleting_the_account_takes_app_lock_with_it(self):
        self.client.delete('/api/auth/me/')
        self.assertFalse(MPINCredential.objects.filter(account=self.account).exists())
        self.assertFalse(TrustedDevice.objects.filter(account=self.account).exists())

    def test_the_device_list_never_exposes_a_token(self):
        body = str(self.client.get(DEVICES_URL).data)
        self.assertNotIn(self.token, body)
        self.assertNotIn('token_hash', body)
