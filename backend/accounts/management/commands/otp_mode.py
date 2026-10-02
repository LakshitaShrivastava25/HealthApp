from django.core.management.base import BaseCommand, CommandError

from accounts.models import OTPConfig


class Command(BaseCommand):
    help = 'Show or switch the login OTP mode: `otp_mode`, `otp_mode master`, `otp_mode sms`.'

    def add_arguments(self, parser):
        parser.add_argument('mode', nargs='?', choices=OTPConfig.Mode.values)
        parser.add_argument('--master-otp', help='Set a new 6-digit master OTP.')

    def handle(self, *args, **options):
        config = OTPConfig.load()
        if options['master_otp'] is not None:
            code = options['master_otp']
            if not (code.isdigit() and len(code) == 6):
                raise CommandError('Master OTP must be exactly 6 digits.')
            config.master_otp = code
        if options['mode']:
            config.mode = options['mode']
        config.save()
        self.stdout.write(f'OTP mode: {config.get_mode_display()} (master OTP {config.master_otp})')
