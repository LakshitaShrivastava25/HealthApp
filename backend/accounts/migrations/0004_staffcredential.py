import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_otp_mode_label'),
    ]

    operations = [
        migrations.CreateModel(
            name='StaffCredential',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('password', models.CharField(max_length=128)),
                ('failed_attempts', models.PositiveSmallIntegerField(default=0)),
                ('locked_until', models.DateTimeField(blank=True, null=True)),
                ('last_login_at', models.DateTimeField(blank=True, null=True)),
                ('password_changed_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('account', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='staff_credential',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
