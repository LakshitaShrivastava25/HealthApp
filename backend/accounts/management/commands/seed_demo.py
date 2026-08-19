"""
Seeds a demo account with data matching the User Portal frontend's mock
data — so a fresh clone of both repos shows the same realistic content
instead of an empty app. Run after migrate:

    python manage.py seed_demo

Demo login: phone +919876500000 — use /api/auth/send-otp/ then check the
server log (or the debug_otp field, since DEBUG=True) for the OTP.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand

from accounts.models import Account
from doctors.models import Doctor
from documents.models import Document, TimelineEvent
from emergency.models import EmergencyProfile
from family.models import AllergyRecord, Profile
from insurance.models import InsurancePolicy, PolicyExclusion, PolicySubLimit, PolicyWaitingPeriod
from medicines.models import Medication, ReminderSchedule

DEMO_PHONE = '+919876500000'


class Command(BaseCommand):
    help = 'Seeds demo data matching the User Portal mock data (mockData.ts)'

    def handle(self, *args, **options):
        account, created = Account.objects.get_or_create(phone_number=DEMO_PHONE, defaults={'role': Account.Role.PATIENT})
        if not created:
            self.stdout.write('Demo account already exists — clearing its data first.')
            account.profiles.all().delete()

        profile = Profile.objects.create(
            account=account,
            full_name='Lakshita Shrivastava',
            relation=Profile.Relation.SELF,
            gender=Profile.Gender.FEMALE,
            blood_group='B+',
            date_of_birth=date(1998, 3, 14),
        )

        AllergyRecord.objects.create(profile=profile, kind=AllergyRecord.Kind.ENVIRONMENTAL, substance='Dust', reaction='Sneezing, irritation')
        AllergyRecord.objects.create(profile=profile, kind=AllergyRecord.Kind.ENVIRONMENTAL, substance='Pollen', reaction='Congestion')

        # -- Documents + Timeline -----------------------------------------
        docs = [
            ('Blood Test Report - May 2026', Document.Category.REPORT, 'Pathkind Labs', date(2026, 5, 12)),
            ('MRI Spine Report', Document.Category.REPORT, 'HealthCare Center', date(2026, 5, 1)),
            ('Chest X-Ray', Document.Category.SCAN, 'City Hospital', date(2026, 5, 10)),
            ('Prescription - Dr. Sharma', Document.Category.PRESCRIPTION, '', date(2026, 5, 8)),
            ('Discharge Summary', Document.Category.DISCHARGE, 'City Hospital', date(2026, 4, 26)),
        ]
        for title, category, hospital, doc_date in docs:
            doc = Document.objects.create(
                profile=profile, title=title, category=category, hospital_name=hospital,
                document_date=doc_date, status=Document.Status.PROCESSED,
            )
            TimelineEvent.objects.create(
                profile=profile, source_document=doc, event_date=doc_date,
                event_type=category, title=title, summary=hospital,
            )

        TimelineEvent.objects.create(profile=profile, event_date=date(2025, 12, 15), event_type='diagnosis', title='Typhoid', summary='City Hospital')
        TimelineEvent.objects.create(profile=profile, event_date=date(2025, 8, 20), event_type='allergy', title='Allergy Recorded', summary='Dust, Pollen')

        # -- Insurance -----------------------------------------------------
        policy = InsurancePolicy.objects.create(
            profile=profile,
            status=InsurancePolicy.Status.VALIDATED,
            insurer='Star Health Insurance',
            policy_number='SHI/2025/4567806',
            plan_name='Family Health Optima',
            sum_insured=Decimal('1000000'),
            coverage_start=date(2025, 4, 1),
            coverage_end=date(2026, 3, 31),
            room_rent_limit='1 Private AC',
            co_payment_percent=Decimal('10'),
        )
        PolicyWaitingPeriod.objects.create(policy=policy, condition='maternity', months=24)
        PolicySubLimit.objects.create(policy=policy, category='Cataract', limit_text='₹40,000 per eye')
        PolicyExclusion.objects.create(policy=policy, description='cosmetic surgery')

        # -- Medicines -----------------------------------------------------
        med1 = Medication.objects.create(profile=profile, name='Paracetamol 650mg', dosage='1 Tablet', instructions='After Food', frequency='3x daily', is_active=True)
        for t in ['08:00', '14:00', '20:00']:
            ReminderSchedule.objects.create(medication=med1, time_of_day=t)

        med2 = Medication.objects.create(profile=profile, name='Vitamin D3 60K', dosage='1 Capsule', instructions='Weekly', frequency='weekly', is_active=True)
        ReminderSchedule.objects.create(medication=med2, time_of_day='09:00', days_of_week='sun')

        med3 = Medication.objects.create(profile=profile, name='Aspirin 75mg', dosage='1 Tablet', instructions='After Food', frequency='daily', is_active=True)
        ReminderSchedule.objects.create(medication=med3, time_of_day='08:00')

        # -- Emergency profile -----------------------------------------------
        EmergencyProfile.objects.create(
            profile=profile,
            emergency_contact_name='Priyanshi Shrivastava',
            emergency_contact_phone='+918000000000',
        )

        # -- One pending doctor (for Admin Portal's verification queue demo) --
        doctor_account, _ = Account.objects.get_or_create(
            phone_number='+919876500001', defaults={'role': Account.Role.DOCTOR}
        )
        Doctor.objects.get_or_create(
            account=doctor_account,
            defaults=dict(
                full_name='R. Sharma', specialization='General Physician',
                qualification='MBBS, MD', experience_years=10,
                verification_status=Doctor.VerificationStatus.PENDING,
            ),
        )

        # -- Staff admin account for the Admin Portal ---------------------
        if not Account.objects.filter(phone_number='+919876500099').exists():
            admin_account = Account.objects.create_user(phone_number='+919876500099', password='ChangeMe123!')
            admin_account.role = Account.Role.ADMIN
            admin_account.is_staff = True
            admin_account.is_superuser = True
            admin_account.save()

        self.stdout.write(self.style.SUCCESS(
            f"\nDemo data seeded.\n"
            f"  Patient demo login: {DEMO_PHONE} (use send-otp/verify-otp)\n"
            f"  Admin login: +919876500099 / ChangeMe123! (Django admin at /admin/)\n"
        ))
