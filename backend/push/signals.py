"""
Which events reach a phone.

Each hook compares the old and new status so a push goes out once, when
something actually changes — not on every unrelated save of the same row.

Deliberately not pushed:
- Document and policy processing: it runs inside the upload request, so
  the person is already looking at the result.
- Medicine reminders: the app schedules those on the phone itself, so
  they fire at the exact minute even without a network connection.
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from doctors.models import ConsultationNote, Doctor, DoctorPatientAccess
from family.models import Notification

from .services import notify_account


def _remember_previous(sender, instance, field):
    """Stash the stored value of `field` on the instance before it is overwritten."""
    previous = None
    if instance.pk:
        previous = sender.objects.filter(pk=instance.pk).values_list(field, flat=True).first()
    setattr(instance, f'_previous_{field}', previous)


def _changed_to(instance, field, created):
    previous = getattr(instance, f'_previous_{field}', None)
    current = getattr(instance, field)
    return created or previous != current


# --- Doctor ↔ patient access -------------------------------------------

@receiver(pre_save, sender=DoctorPatientAccess)
def _access_pre_save(sender, instance, **kwargs):
    _remember_previous(sender, instance, 'status')


@receiver(post_save, sender=DoctorPatientAccess)
def _access_post_save(sender, instance, created, **kwargs):
    if not _changed_to(instance, 'status', created):
        return
    status = instance.status
    doctor_name = f'Dr. {instance.doctor.full_name}'
    patient_name = instance.profile.full_name

    if status == DoctorPatientAccess.Status.PENDING:
        notify_account(
            instance.profile.account,
            'Doctor access request',
            f"{doctor_name} is asking to see {patient_name}'s health records.",
            {'url': '/(patient)/doctor-access', 'type': 'access_request'},
        )
    elif status == DoctorPatientAccess.Status.APPROVED:
        notify_account(
            instance.doctor.account,
            'Access approved',
            f'{patient_name} shared their health records with you.',
            {'url': f'/(doctor)/patient/{instance.profile_id}', 'type': 'access_approved'},
        )
    elif status == DoctorPatientAccess.Status.DENIED:
        notify_account(
            instance.doctor.account,
            'Access request declined',
            f'{patient_name} declined your request to view their records.',
            {'url': '/(doctor)/(tabs)', 'type': 'access_denied'},
        )


# --- Doctor verification -----------------------------------------------

@receiver(pre_save, sender=Doctor)
def _doctor_pre_save(sender, instance, **kwargs):
    _remember_previous(sender, instance, 'verification_status')


@receiver(post_save, sender=Doctor)
def _doctor_post_save(sender, instance, created, **kwargs):
    if created or not _changed_to(instance, 'verification_status', created):
        return
    if instance.verification_status == Doctor.VerificationStatus.VERIFIED:
        notify_account(
            instance.account,
            "You're verified",
            'Your CurePath doctor account is approved. You can now request patient access.',
            {'url': '/', 'type': 'doctor_verified'},
        )
    elif instance.verification_status == Doctor.VerificationStatus.REJECTED:
        notify_account(
            instance.account,
            'Verification update',
            "We couldn't verify your doctor account. Open CurePath for details.",
            {'url': '/', 'type': 'doctor_rejected'},
        )


# --- Consultation notes ------------------------------------------------

@receiver(post_save, sender=ConsultationNote)
def _note_post_save(sender, instance, created, **kwargs):
    if not created:
        return
    notify_account(
        instance.profile.account,
        'New consultation note',
        f'Dr. {instance.doctor.full_name} added a note for {instance.profile.full_name}.',
        {'url': '/(patient)/timeline', 'type': 'consultation_note'},
    )


# --- Generated in-app notifications (premium renewals) -----------------

@receiver(post_save, sender=Notification)
def _notification_post_save(sender, instance, created, **kwargs):
    if not created or instance.notification_type != Notification.Type.PREMIUM_DUE:
        return
    notify_account(
        instance.profile.account,
        instance.title,
        instance.message,
        {'url': '/(patient)/(tabs)/insurance', 'type': 'premium_due'},
    )
