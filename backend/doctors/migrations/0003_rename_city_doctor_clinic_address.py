# Hand-written in place of the auto-generated Remove+Add pair.
#
# Django proposed dropping `city` and adding `clinic_address`, which is
# equivalent here only because no row currently holds a city value. A
# RenameField preserves whatever is in the column instead, so this stays
# safe if it is ever applied to a database where doctors HAVE registered
# with a city — the value carries forward as the start of their address
# rather than being silently discarded.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('doctors', '0002_doctor_booking_phone_number_doctor_city_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='doctor',
            old_name='city',
            new_name='clinic_address',
        ),
        migrations.AlterField(
            model_name='doctor',
            name='clinic_address',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
