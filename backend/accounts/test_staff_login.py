"""
Email + password sign-in for the web Admin Portal (curapath.in/admin).
"""

import io
import os
from datetime import timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account, StaffCredential
from admin_portal.models import AuditLog

ADMIN_PHONE = '+919000000001'
EMAIL = 'admin@curapath.com'
PASSWORD = 'A-long-test-passphrase-42'
URL = '/api/auth/staff-login/'


def set_login(email=EMAIL, password=PASSWORD, *args):
    out = io.StringIO()
    with patch.dict(os.environ, {'STAFF_LOGIN_PASSWORD': password}):
        call_command('set_staff_login', email, *args, stdout=out)
    return out.getvalue()


@override_settings(ADMIN_PHONE_NUMBERS=[ADMIN_PHONE])
class StaffLoginTests(TestCase):
    def setUp(self):
        self.admin = Account.objects.create_user(
            phone_number=ADMIN_PHONE, role=Account.Role.ADMIN, is_staff=True
        )
        set_login()
        self.client_api = APIClient()

    def login(self, email=EMAIL, password=PASSWORD):
        return self.client_api.post(URL, {'email': email, 'password': password}, format='json')

    def test_signs_in_to_the_admin_account_and_opens_the_portal(self):
        response = self.login()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['account']['id'], str(self.admin.id))
        self.assertEqual(response.data['account']['role'], 'admin')

        portal = APIClient()
        portal.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(portal.get('/api/admin/dashboard/summary/').status_code, 200)
        self.assertTrue(AuditLog.objects.filter(staff=self.admin, action='staff_password_login').exists())

    def test_email_is_case_insensitive(self):
        self.assertEqual(self.login(email='Admin@CuraPath.com').status_code, 200)

    def test_wrong_password_and_unknown_email_look_the_same(self):
        wrong = self.login(password='not-it')
        unknown = self.login(email='nobody@curapath.com')
        self.assertEqual((wrong.status_code, unknown.status_code), (401, 401))
        self.assertEqual(wrong.data['detail'], unknown.data['detail'])

    def test_locks_after_five_wrong_passwords_even_for_the_right_one(self):
        for _ in range(StaffCredential.MAX_FAILURES - 1):
            self.assertEqual(self.login(password='wrong').status_code, 401)
        locked = self.login(password='wrong')
        self.assertEqual(locked.status_code, 429)
        self.assertIn('Try again in 15 minutes', locked.data['detail'])
        self.assertEqual(self.login().status_code, 429, 'the right password is refused while locked')

        StaffCredential.objects.update(locked_until=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.login().status_code, 200, 'usable again once the lock expires')

    def test_success_resets_the_failure_count(self):
        for _ in range(StaffCredential.MAX_FAILURES - 1):
            self.login(password='wrong')
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(StaffCredential.objects.get().failed_attempts, 0)

    def test_refused_once_the_number_leaves_the_allow_list(self):
        with override_settings(ADMIN_PHONE_NUMBERS=[]):
            self.assertEqual(self.login().status_code, 403)

    def test_refused_for_a_deactivated_account(self):
        Account.objects.filter(pk=self.admin.pk).update(is_active=False)
        self.assertEqual(self.login().status_code, 403)

    def test_a_patient_setting_the_same_email_gains_nothing(self):
        patient = Account.objects.create_user(phone_number='+919000000099')
        patient_client = APIClient()
        patient_client.force_authenticate(patient)
        patient_client.patch('/api/auth/me/', {'email': EMAIL}, format='json')
        response = self.login()
        self.assertEqual(response.data['account']['id'], str(self.admin.id))

    def test_django_admin_password_is_untouched(self):
        """The portal password is not Account.password, which Django admin's
        unthrottled login checks."""
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.has_usable_password())
        self.assertFalse(self.admin.check_password(PASSWORD))

    def test_otp_sign_in_still_reaches_the_same_account(self):
        self.assertEqual(StaffCredential.objects.get().account_id, self.admin.id)
        self.assertEqual(Account.objects.filter(phone_number=ADMIN_PHONE).count(), 1)

    def test_missing_fields_are_a_bad_request(self):
        self.assertEqual(self.client_api.post(URL, {'email': EMAIL}, format='json').status_code, 400)


@override_settings(ADMIN_PHONE_NUMBERS=[ADMIN_PHONE])
class SetStaffLoginCommandTests(TestCase):
    def test_weak_password_needs_explicit_consent(self):
        Account.objects.create_user(phone_number=ADMIN_PHONE, role=Account.Role.ADMIN)
        with self.assertRaisesMessage(CommandError, 'Password rejected'):
            set_login(EMAIL, 'curapath@123')
        self.assertFalse(StaffCredential.objects.exists())

        output = set_login(EMAIL, 'curapath@123', '--allow-weak')
        self.assertIn('weak password accepted', output)
        self.assertTrue(StaffCredential.objects.get().check_password('curapath@123'))

    def test_creates_the_admin_account_when_none_exists_yet(self):
        set_login()
        account = Account.objects.get(phone_number=ADMIN_PHONE)
        self.assertEqual(account.role, Account.Role.ADMIN)
        self.assertEqual(account.email, EMAIL)

    def test_updating_changes_the_password_and_unlocks(self):
        set_login()
        StaffCredential.objects.update(locked_until=timezone.now() + timedelta(minutes=10), failed_attempts=3)
        set_login(EMAIL, 'Another-long-passphrase-7')
        credential = StaffCredential.objects.get()
        self.assertTrue(credential.check_password('Another-long-passphrase-7'))
        self.assertFalse(credential.check_password(PASSWORD))
        self.assertIsNone(credential.locked_until)
        self.assertEqual(StaffCredential.objects.count(), 1)

    def test_refuses_a_number_off_the_allow_list(self):
        with self.assertRaisesMessage(CommandError, 'not on ADMIN_PHONE_NUMBERS'):
            set_login(EMAIL, PASSWORD, '--phone', '+919111111111')

    def test_remove(self):
        set_login()
        call_command('set_staff_login', EMAIL, '--remove', stdout=io.StringIO())
        self.assertFalse(StaffCredential.objects.exists())
