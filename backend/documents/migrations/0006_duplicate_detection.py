"""
Duplicate detection: file hash, page fingerprints, copy links, and a log of
every upload attempt.

Additive only. Existing documents get their original filename (the stored
name minus the storage's random suffix) and one "new" upload event each.
Their hashes are filled by `manage.py backfill_document_fingerprints`, which
has to download each file and so cannot run inside a migration.
"""

import re
import uuid

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models

_STORAGE_SUFFIX = re.compile(r'_[0-9a-f]{8}(?=\.[A-Za-z0-9]+$)')


def backfill_upload_history(apps, schema_editor):
    Document = apps.get_model('documents', 'Document')
    DocumentUpload = apps.get_model('documents', 'DocumentUpload')
    events = []
    for document in Document.objects.all().iterator():
        stored = (document.file.name or '').rsplit('/', 1)[-1]
        original = _STORAGE_SUFFIX.sub('', stored)[:255]
        if original and not document.original_filename:
            document.original_filename = original
            document.save(update_fields=['original_filename'])
        events.append(DocumentUpload(
            profile_id=document.profile_id,
            document_id=document.id,
            original_filename=document.original_filename,
            outcome='new',
            created_at=document.uploaded_at,
        ))
    DocumentUpload.objects.bulk_create(events)


def remove_upload_history(apps, schema_editor):
    apps.get_model('documents', 'DocumentUpload').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0005_cleanup_orphaned_timeline_events'),
        ('family', '0004_profile_reference_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='original_filename',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='document',
            name='file_sha256',
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.AddField(
            model_name='document',
            name='file_size',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='document',
            name='page_fingerprints',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='document',
            name='duplicate_of',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='copies', to='documents.document',
            ),
        ),
        migrations.AddField(
            model_name='document',
            name='duplicate_kind',
            field=models.CharField(
                blank=True, max_length=20,
                choices=[
                    ('exact', 'Byte-for-byte the same file'),
                    ('same_content', 'Same text on every page'),
                    ('manual', 'Marked as a duplicate by the person'),
                ],
            ),
        ),
        migrations.AddField(
            model_name='document',
            name='possible_duplicate_of',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='+', to='documents.document',
            ),
        ),
        migrations.AddField(
            model_name='document',
            name='possible_duplicate_score',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='document',
            name='possible_duplicate_pages',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='document',
            name='duplicate_check_dismissed',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='DocumentUpload',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('original_filename', models.CharField(blank=True, max_length=255)),
                ('file_sha256', models.CharField(blank=True, max_length=64)),
                ('file_size', models.PositiveIntegerField(blank=True, null=True)),
                ('outcome', models.CharField(
                    choices=[('new', 'New document'), ('exact_duplicate', 'Already in the locker')],
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('document', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='uploads', to='documents.document',
                )),
                ('profile', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='document_uploads', to='family.profile',
                )),
            ],
            options={'ordering': ['created_at']},
        ),
        migrations.RunPython(backfill_upload_history, remove_upload_history),
    ]
