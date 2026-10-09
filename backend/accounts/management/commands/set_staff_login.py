import copy
import getpass
import os

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction

from accounts.models import Account, StaffCredential
from accounts.services import STAFF_ROLES
from config.migration_check import require_migrations

PASSWORD_ENV = 'STAFF_LOGIN_PASSWORD'


class Command(BaseCommand):
    help = (
        'Create or update the email + password used to sign in to the web Admin Portal '
        '(curapath.in/admin). The password is read from a hidden prompt, or from the '
        f'{PASSWORD_ENV} environment variable — never from the command line, where it would '
        'end up in shell history.'
    )

    def add_arguments(self, parser):
        parser.add_argument('email', help='The sign-in email, e.g. admin@curapath.com')
        parser.add_argument(
            '--phone',
            help='The staff account to sign in to (must be on ADMIN_PHONE_NUMBERS). '
                 'Defaults to the one admin account on that list.',
        )
        parser.add_argument(
            '--allow-weak', action='store_true',
            help="Accept a password that fails Django's password checks (not recommended).",
        )
        parser.add_argument('--remove', action='store_true', help='Remove this email sign-in instead.')

    def handle(self, *args, email, phone, allow_weak, remove, **options):
        require_migrations('accounts')
        email = email.strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            raise CommandError(f'"{email}" is not a valid email address.')

        if remove:
            deleted, _ = StaffCredential.objects.filter(email=email).delete()
            if not deleted:
                raise CommandError(f'No Admin Portal sign-in exists for {email}.')
            self.stdout.write(self.style.SUCCESS(f'Removed the Admin Portal sign-in for {email}.'))
            return

        account = self._account(email, phone)
        password = self._password()
        # Checked against the sign-in email too: a password made from it
        # ("curapath…" for admin@curapath.com) is among the first guessed.
        subject = copy.copy(account)
        subject.email = email
        try:
            validate_password(password, user=subject)
        except ValidationError as exc:
            problems = ' '.join(exc.messages)
            if not allow_weak:
                raise CommandError(
                    f'Password rejected: {problems} Choose a stronger password, or pass --allow-weak '
                    'to use it anyway.'
                )
            self.stdout.write(self.style.WARNING(f'Warning — weak password accepted (--allow-weak): {problems}'))

        with transaction.atomic():
            if account.role not in STAFF_ROLES:
                # The same upgrade verify-otp gives an allow-listed number.
                account.role = Account.Role.ADMIN
                account.is_staff = True
            if not account.email:
                account.email = email
            account.save()
            credential, created = StaffCredential.objects.get_or_create(
                account=account, defaults={'email': email}
            )
            credential.email = email
            credential.set_password(password)
            credential.failed_attempts = 0
            credential.locked_until = None
            credential.save()

        self.stdout.write(self.style.SUCCESS(
            f'{"Created" if created else "Updated"} the Admin Portal sign-in {email} '
            f'for the {account.get_role_display()} account {account.phone_number}. '
            'Sign in at /admin on the website.'
        ))

    def _account(self, email, phone):
        allowed = settings.ADMIN_PHONE_NUMBERS
        existing = StaffCredential.objects.select_related('account').filter(email=email).first()

        if phone:
            if phone not in allowed:
                raise CommandError(
                    f'{phone} is not on ADMIN_PHONE_NUMBERS, so the Admin Portal would refuse it. '
                    'Add it to that setting first.'
                )
            if existing and existing.account.phone_number != phone:
                raise CommandError(
                    f'{email} already signs in to {existing.account.phone_number}. '
                    f'Remove it first (--remove) to move it to {phone}.'
                )
            account, _ = Account.objects.get_or_create(phone_number=phone)
        elif existing:
            account = existing.account
        else:
            admins = list(Account.objects.filter(role=Account.Role.ADMIN, phone_number__in=allowed, is_active=True))
            if len(admins) == 1:
                account = admins[0]
            elif not admins and len(allowed) == 1:
                account, _ = Account.objects.get_or_create(phone_number=allowed[0])
            else:
                raise CommandError(
                    'Choose the staff account with --phone. Numbers on ADMIN_PHONE_NUMBERS: '
                    + (', '.join(allowed) or '(none)')
                )

        if not account.is_active:
            raise CommandError(f'The account {account.phone_number} is deactivated.')
        if account.phone_number not in allowed:
            raise CommandError(
                f'The account {account.phone_number} is no longer on ADMIN_PHONE_NUMBERS, so the Admin '
                'Portal would refuse it.'
            )
        return account

    def _password(self):
        password = os.environ.get(PASSWORD_ENV)
        if password:
            return password
        try:
            first = getpass.getpass('Password: ')
            second = getpass.getpass('Password (again): ')
        except (EOFError, KeyboardInterrupt):
            raise CommandError(f'No password given. Type it at the prompt, or set {PASSWORD_ENV}.')
        if not first:
            raise CommandError('The password cannot be empty.')
        if first != second:
            raise CommandError('The two passwords do not match.')
        return first
