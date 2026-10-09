"""
Medicine consolidation: one Medication per medicine, one MedicationOccurrence
per prescription line.

Additive only — no column is dropped and no row is deleted. Existing rows are
classified (from a prescription, or added by hand), and rows whose source
document was deleted keep their information as a history line marked
"source deleted". The prescription lines of existing documents and the
consolidation itself are built by medicines/consolidation.py the first time
each profile's medicines are read (or by `manage.py rebuild_medications`).
"""

import uuid

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


def classify_existing_rows(apps, schema_editor):
    Medication = apps.get_model('medicines', 'Medication')
    MedicationOccurrence = apps.get_model('medicines', 'MedicationOccurrence')

    Medication.objects.filter(source_document__isnull=False).update(origin='prescription')

    # Before this, deleting a document left its medicines behind with no
    # source. Only extraction set start_date (the add-medicine forms never
    # did), which tells those leftovers apart from medicines added by hand.
    leftovers = (
        Medication.objects.filter(source_document__isnull=True, start_date__isnull=False)
        .annotate(reminder_count=models.Count('reminders'))
    )
    lines = []
    for row in leftovers:
        if row.reminder_count:
            continue  # the person built on it; keep it as their own
        row.origin = 'prescription'
        row.save(update_fields=['origin'])
        lines.append(MedicationOccurrence(
            profile_id=row.profile_id,
            medication_id=row.id,
            source_deleted=True,
            name=row.name,
            dosage=row.dosage,
            frequency=row.frequency,
            instructions=row.instructions,
            prescribed_on=row.start_date,
        ))
    MedicationOccurrence.objects.bulk_create(lines)


def unclassify(apps, schema_editor):
    apps.get_model('medicines', 'MedicationOccurrence').objects.filter(source_deleted=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('medicines', '0001_initial'),
        ('documents', '0006_duplicate_detection'),
        ('family', '0004_profile_reference_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='medication',
            name='match_key',
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
        migrations.AddField(
            model_name='medication',
            name='generic_name',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='medication',
            name='brand_names',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='medication',
            name='form',
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name='medication',
            name='route',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='medication',
            name='release',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name='medication',
            name='status',
            field=models.CharField(
                default='active', max_length=20,
                choices=[
                    ('active', 'Active'), ('continued', 'Continued'), ('modified', 'Modified'),
                    ('needs_review', 'Needs review'), ('discontinued', 'Discontinued'),
                    ('completed', 'Course completed'), ('one_time', 'One-time'),
                ],
            ),
        ),
        migrations.AddField(
            model_name='medication',
            name='status_reason',
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='medication',
            name='status_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='medication',
            name='status_computed_on',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='medication',
            name='first_prescribed_on',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='medication',
            name='last_prescribed_on',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='medication',
            name='last_prescribed_by',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name='medication',
            name='prescription_count',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='medication',
            name='newer_prescriptions_without',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='medication',
            name='possible_duplicates',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='medication',
            name='origin',
            field=models.CharField(
                default='manual', max_length=20,
                choices=[('prescription', 'From a prescription'), ('manual', 'Added by hand')],
            ),
        ),
        migrations.AddField(
            model_name='medication',
            name='user_status',
            field=models.CharField(
                blank=True, max_length=20,
                choices=[('taking', 'Still taking'), ('stopped', 'Stopped'), ('removed', 'Removed from list')],
            ),
        ),
        migrations.AddField(
            model_name='medication',
            name='user_status_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='medication',
            name='merged_into',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='merged_rows', to='medicines.medication',
            ),
        ),
        migrations.AddField(
            model_name='medication',
            name='is_archived',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='MedicationOccurrence',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('source_deleted', models.BooleanField(default=False)),
                ('line_index', models.PositiveSmallIntegerField(default=0)),
                ('name', models.CharField(max_length=255)),
                ('generic_name', models.CharField(blank=True, max_length=255)),
                ('brand_name', models.CharField(blank=True, max_length=150)),
                ('strength', models.CharField(blank=True, max_length=100)),
                ('form', models.CharField(blank=True, max_length=50)),
                ('route', models.CharField(blank=True, max_length=30)),
                ('release', models.CharField(blank=True, max_length=30)),
                ('dosage', models.CharField(blank=True, max_length=100)),
                ('frequency', models.CharField(blank=True, max_length=100)),
                ('instructions', models.CharField(blank=True, max_length=255)),
                ('duration', models.CharField(blank=True, max_length=100)),
                ('action', models.CharField(
                    blank=True, max_length=20,
                    choices=[
                        ('start', 'Started'), ('continue', 'Continued'), ('change', 'Changed'),
                        ('stop', 'Stopped'), ('hold', 'Temporarily withheld'), ('one_time', 'One-time dose'),
                    ],
                )),
                ('action_text', models.CharField(blank=True, max_length=255)),
                ('prescribed_on', models.DateField(blank=True, null=True)),
                ('doctor_name', models.CharField(blank=True, max_length=150)),
                ('hospital_name', models.CharField(blank=True, max_length=150)),
                ('end_date', models.DateField(blank=True, null=True)),
                ('match_key', models.CharField(blank=True, db_index=True, max_length=255)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('medication', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='occurrences', to='medicines.medication',
                )),
                ('profile', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='medication_occurrences',
                    to='family.profile',
                )),
                ('source_document', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                    related_name='medication_occurrences', to='documents.document',
                )),
            ],
            options={'ordering': ['prescribed_on', 'line_index']},
        ),
        migrations.CreateModel(
            name='MedicationMatchDecision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key_from', models.CharField(max_length=255)),
                ('key_to', models.CharField(max_length=255)),
                ('decision', models.CharField(
                    choices=[('same', 'Same medicine'), ('different', 'Different medicines')], max_length=10,
                )),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('profile', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='medication_match_decisions',
                    to='family.profile',
                )),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(
                        fields=('profile', 'key_from', 'key_to'), name='unique_medication_match_decision',
                    ),
                ],
            },
        ),
        migrations.RunPython(classify_existing_rows, unclassify),
    ]
