from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('insurance', '0002_insurancepolicy_premium_amount_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='insurancepolicy',
            name='processing_started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
