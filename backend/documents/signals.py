"""
Removes stored files when the rows that own them are deleted.

Django never deletes a FileField's file on its own, so without this a deleted
document, insurance policy or doctor licence — or a whole deleted account,
via cascade — would leave the medical file behind in Cloudinary (or the
StoredFile table). The file goes only after the transaction commits, so a
rolled-back delete never loses a file its row still points to.
"""

import logging

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from doctors.models import Doctor
from insurance.models import InsurancePolicy

from .models import Document

logger = logging.getLogger(__name__)


def _delete_file_on_commit(fieldfile):
    if not fieldfile or not fieldfile.name:
        return
    storage, name = fieldfile.storage, fieldfile.name

    def delete():
        try:
            storage.delete(name)
        except Exception:  # a storage hiccup must not fail the user's delete
            logger.exception('Could not delete stored file %s', name)

    transaction.on_commit(delete)


@receiver(post_delete, sender=Document)
def delete_document_file(sender, instance, **kwargs):
    _delete_file_on_commit(instance.file)


@receiver(post_delete, sender=InsurancePolicy)
def delete_policy_file(sender, instance, **kwargs):
    _delete_file_on_commit(instance.file)


@receiver(post_delete, sender=Doctor)
def delete_doctor_license(sender, instance, **kwargs):
    _delete_file_on_commit(instance.license_document)
