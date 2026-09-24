"""
Adds the short patient reference code, backfills every existing profile, and
only then applies the unique constraint.

Hand-written rather than auto-generated because a plain AddField with a
callable default evaluates that callable ONCE and writes the same value to
every existing row — which is fine for a normal default and fatal for a
unique one. Splitting it three ways (add nullable-ish, fill, constrain) is
the standard safe path and keeps the backfill inside the migration, so a
fresh deploy can never end up with a schema that has the column but no codes.
"""

import secrets
import string

from django.db import migrations, models

import family.models


def backfill_reference_codes(apps, schema_editor):
    """
    Give every existing profile a real, unique code.

    Uses the historical model via apps.get_model (never the live import) so
    this keeps working if Profile changes later. That also means it cannot
    call family.models.generate_reference_code, which queries the live model
    — the generation is repeated here against the historical queryset.
    """
    Profile = apps.get_model('family', 'Profile')
    taken = set(
        Profile.objects.exclude(reference_code='').values_list('reference_code', flat=True)
    )
    filled = 0
    for profile in Profile.objects.filter(reference_code=''):
        for _ in range(20):
            code = (
                ''.join(secrets.choice(string.ascii_uppercase) for _ in range(2))
                + ''.join(secrets.choice(string.digits) for _ in range(4))
            )
            if code not in taken:
                taken.add(code)
                profile.reference_code = code
                profile.save(update_fields=['reference_code'])
                filled += 1
                break
        else:
            raise RuntimeError('Could not find a free reference code for profile %s' % profile.pk)
    print('  backfilled %d profile(s) with a reference code' % filled)


def noop_reverse(apps, schema_editor):
    """Reversing just drops the column again, so nothing to undo here."""


class Migration(migrations.Migration):

    dependencies = [('family', '0003_alter_profile_gender')]

    operations = [
        # 1 — add it blank and non-unique so existing rows are legal.
        migrations.AddField(
            model_name='profile',
            name='reference_code',
            field=models.CharField(blank=True, default='', max_length=6),
        ),
        # 2 — fill every existing row.
        migrations.RunPython(backfill_reference_codes, noop_reverse),
        # 3 — now that no duplicates exist, enforce it.
        migrations.AlterField(
            model_name='profile',
            name='reference_code',
            field=models.CharField(
                blank=True,
                default=family.models.generate_reference_code,
                max_length=6,
                unique=True,
            ),
        ),
    ]
