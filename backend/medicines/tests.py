"""
One medicine, one row: consolidation of prescription lines across years of
prescriptions, and statuses taken only from what the doctors wrote.

The fixtures mirror a real profile that showed Aspirin nine times, hid
Ticagrelor and Pantoprazole behind pagination, and kept a one-time iron
infusion "active" for two years.
"""

from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account
from documents.derived import rebuild_derived_records
from documents.models import Document
from family.models import Profile

from . import normalize as nz
from .consolidation import rebuild_profile_medications
from .models import Medication, MedicationOccurrence, ReminderSchedule


class NormalizeTests(TestCase):
    def key(self, name, dosage=''):
        return nz.identify(name, dosage).key

    def test_same_medicine_written_differently_has_one_identity(self):
        self.assertEqual(self.key('ASPIRIN 75MG (ECOSPRIN)'), self.key('Aspirin 150mg'))
        self.assertEqual(self.key('Ecosprin 75'), self.key('aspirin 75 mg'))
        self.assertEqual(self.key('Thyronorm 25mcg'), self.key('Levothyroxine 25 µg'))
        self.assertEqual(self.key('Levodopa 150mg + Carbidopa 37.5mg'),
                         self.key('CARBIDOPA+LEVODOPA 25MG+100MG (SYNDOPA PLUS)'))
        self.assertEqual(self.key('Losartan Potassium 50mg'), self.key('Losartan 50mg'))
        self.assertEqual(self.key('Tab. Dolo 650'), self.key('Paracetamol 650 mg'))

    def test_different_products_are_not_merged(self):
        # Plain and controlled-release are taken together (day and night).
        self.assertNotEqual(self.key('CARBIDOPA+LEVODOPA 25MG+100MG (SYNDOPA PLUS)'),
                            self.key('CARBIDOPA+LEVODOPA 25MG+100MG (SYNDOPA CR)'))
        # Same drug, different route.
        self.assertNotEqual(self.key('Ferric carboxymaltose 500mg', 'Two vials in 100 mL NS'),
                            self.key('Ferric carboxymaltose 500mg', '1 tablet'))
        # Look-alike names stay apart.
        self.assertNotEqual(self.key('Hydroxyzine 25mg'), self.key('Hydralazine 25mg'))
        # A salt that IS the drug is kept.
        self.assertNotEqual(self.key('Potassium Chloride 600mg'), self.key('Sodium Chloride 600mg'))

    def test_strength_is_tracked_but_not_part_of_identity(self):
        low, high = nz.identify('Aspirin 75mg'), nz.identify('Aspirin 150mg (Ecosprin)')
        self.assertEqual(low.key, high.key)
        self.assertNotEqual(low.strength_sig, high.strength_sig)
        combo = nz.identify('Levodopa 150mg + Carbidopa 37.5mg')
        self.assertEqual(combo.strength_sig, ('carbidopa 37.5 mg', 'levodopa 150 mg'))

    def test_extraction_hints_resolve_unknown_brands(self):
        self.assertEqual(
            nz.identify('Zyxoprin 10', generic_name='Atorvastatin').key,
            nz.identify('Atorvastatin 10mg').key,
        )
        self.assertEqual(nz.identify('Something 5mg', route='intravenous').route, 'injection')

    def test_frequency_signature(self):
        self.assertEqual(nz.frequency_signature('Once Daily (0-1-0-0)'), '1')
        self.assertEqual(nz.frequency_signature('OD'), '1')
        self.assertEqual(nz.frequency_signature('BD'), '2')
        self.assertEqual(nz.frequency_signature('Twice Daily (1-0-0-1)'), '2')
        self.assertEqual(nz.frequency_signature('1-1-1-0'), '3')
        self.assertEqual(nz.frequency_signature('STAT (Immediately)'), 'stat')
        self.assertEqual(nz.frequency_signature('SOS'), 'prn')
        self.assertEqual(nz.frequency_signature(''), '')

    def test_only_explicit_unconditional_instructions_count(self):
        self.assertEqual(nz.classify_action('continue'), nz.ACTION_CONTINUE)
        self.assertEqual(nz.classify_action('Continue on morning of surgery'), nz.ACTION_CONTINUE)
        self.assertEqual(nz.classify_action('Withhold on day of surgery'), nz.ACTION_HOLD)
        self.assertEqual(nz.classify_action('Stop'), nz.ACTION_STOP)
        self.assertEqual(nz.classify_action('To take at bedtime. Stop if any giddiness/nausea'), '')
        self.assertEqual(nz.classify_action('', 'STAT (Immediately)'), nz.ACTION_ONE_TIME)
        self.assertEqual(nz.classify_action('After food'), '')
        # An extraction's "stop" on a conditional instruction is not trusted.
        self.assertEqual(nz.classify_action('stop if rash', hinted='stop'), '')

    def test_course_end_dates(self):
        self.assertEqual(nz.course_end_date(date(2025, 1, 17), '3 Months', 'Start after 2 weeks'), date(2025, 5, 1))
        self.assertEqual(nz.course_end_date(date(2026, 6, 3), '2 weeks'), date(2026, 6, 17))
        self.assertIsNone(nz.course_end_date(date(2026, 6, 3), 'till review'))
        self.assertIsNone(nz.course_end_date(date(2026, 6, 3), ''))


def rx(name, dosage='', frequency='', instructions='', duration='', **extra):
    return {'name': name, 'dosage': dosage, 'frequency': frequency,
            'instructions': instructions, 'duration': duration, **extra}


class ConsolidationTestBase(TestCase):
    TODAY = date(2026, 10, 9)

    def setUp(self):
        self.account = Account.objects.create_user(phone_number='+919000004444')
        self.profile = Profile.objects.create(account=self.account, full_name='Mother', relation='parent')
        self.client_api = APIClient()
        self.client_api.credentials(
            HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(self.account).access_token)
        )
        self.counter = 0

    def prescription(self, when, doctor, medicines, **fields):
        self.counter += 1
        document = Document.objects.create(
            profile=self.profile, title=f'Rx {self.counter}', file=f'documents/rx{self.counter}.pdf',
            category=Document.Category.PRESCRIPTION, status=Document.Status.PROCESSED,
            document_date=when, doctor_name=doctor,
            structured_data={'doctor_name': doctor, 'date': when.isoformat(), 'medicines': medicines},
            **fields,
        )
        rebuild_derived_records(document)
        return document

    def rebuild(self):
        return {m.generic_name or m.name: m for m in rebuild_profile_medications(self.profile, today=self.TODAY)}

    def visible(self):
        return Medication.objects.filter(profile=self.profile, merged_into__isnull=True, is_archived=False)


class ConsolidationTests(ConsolidationTestBase):
    def load_real_history(self):
        """The real profile's prescriptions, with the doctors' names changed."""
        self.prescription(date(2025, 1, 17), 'Rao', [
            rx('FERRIC CARBOXYMALTOSE 500MG/10ML (ENCICARB)', 'Two Vials in 100mL NS', 'STAT (Immediately)', 'over 20 mins'),
            rx('MECOBALAMIN 1500MCG (MECONERV)', '1 Tablet', 'Once Daily (1-0-0-0)', 'Start after 2 weeks', '3 Months'),
        ])
        self.prescription(date(2025, 1, 17), 'Hegde', [
            rx('TICAGRELOR 90MG (BRILINTA)', '90mg', 'Twice Daily (1-0-0-1)', 'After Food', 'Till Review'),
            rx('ASPIRIN 75MG (ECOSPRIN)', '75mg', 'Once Daily (0-1-0-0)', 'After Food', 'Till Review'),
            rx('PANTOPRAZOLE 40MG (PAN)', '40mg', 'Once Daily (1-0-0-0)', 'Before Food', 'Till Review'),
        ])
        self.prescription(date(2025, 1, 24), 'Hegde', [rx('Aspirin 150mg (Ecosprin)', '150mg', 'Once Daily (0-1-0-0)')])
        self.prescription(date(2025, 1, 31), 'Bhat', [
            rx('Thyronorm 25mcg', '25mcg', '', 'Continue on morning of surgery'),
            rx('Levodopa 150mg + Carbidopa 37.5mg', '150mg + 37.5mg', 'BD'),
            rx('Amantadine 100mg', '100mg', 'OD'),
            rx('Telmisartan 40mg + Indapamide 1.5mg', '40mg + 1.5mg', '', 'Withhold on day of surgery'),
            rx('Ticagrelor 90mg', '90mg', 'BD'),
            rx('Aspirin 75mg', '75mg', 'OD'),
        ])
        self.prescription(date(2025, 11, 21), 'Hegde', [rx('Aspirin 150mg', '150mg', 'Once Daily (0-1-0-0)')])
        self.prescription(date(2026, 6, 3), 'Hegde', [
            rx('Aspirin 150mg', '150mg', 'once daily (0-1-0-0)', 'after food'),
            rx('Telmisartan 40mg + Indapamide 1.5mg', '', '', 'continue'),
            rx('Thyronorm 25mcg', '25mcg', '', 'continue'),
            rx('Levodopa 150mg + Carbidopa 37.5mg', '150mg + 37.5mg', 'twice daily', 'continue'),
            rx('Amantadine 100mg', '100mg', 'once daily', 'continue'),
        ])
        self.prescription(date(2026, 6, 3), 'Shetty', [
            rx('CARBIDOPA+LEVODOPA 25MG+100MG (SYNDOPA PLUS)', '1 tablet', '1-1-1-0', 'at least 1 hour before food'),
            rx('CARBIDOPA+LEVODOPA 25MG+100MG (SYNDOPA CR)', '1 tablet', '0-0-0-1', 'At bedtime', '2 weeks'),
            rx('CARBIDOPA+LEVODOPA 50MG+200MG (SYNDOPA CR)', '1 tablet', '0-0-0-1',
               'To take at bedtime. Stop if any giddiness/nausea', 'till review'),
        ])
        self.prescription(date(2026, 6, 4), 'Rao', [
            rx('Telmisartan 40mg + Indapamide 1.5mg'), rx('Thyronorm 25mcg'),
            rx('Levodopa 150mg + Carbidopa 37.5mg', '', 'BD'), rx('Amantadine 100mg', '', 'OD'),
        ])

    def test_years_of_prescriptions_become_one_row_per_medicine(self):
        self.load_real_history()
        medicines = self.rebuild()
        self.assertEqual(MedicationOccurrence.objects.filter(profile=self.profile).count(), 25)
        self.assertEqual(self.visible().count(), 10)
        aspirin = medicines['Aspirin']
        self.assertEqual(aspirin.prescription_count, 5)
        self.assertEqual(aspirin.name, 'Aspirin 150mg')
        self.assertEqual(aspirin.brand_names, ['Ecosprin'])
        self.assertEqual(aspirin.first_prescribed_on, date(2025, 1, 17))
        self.assertEqual(aspirin.last_prescribed_on, date(2026, 6, 3))

    def test_statuses_come_from_explicit_instructions(self):
        self.load_real_history()
        self.rebuild()
        by_name = {m.name: m for m in self.visible()}
        S = Medication.Status

        self.assertEqual(by_name['Aspirin 150mg'].status, S.CONTINUED)
        self.assertIn('Dose changed from 75 mg', by_name['Aspirin 150mg'].status_reason)
        self.assertEqual(by_name['Thyronorm 25mcg'].status, S.CONTINUED)
        self.assertEqual(by_name['Amantadine 100mg'].status, S.CONTINUED)
        # Three doctors, three regimens within two days: a person must check.
        self.assertEqual(by_name['Levodopa 150mg + Carbidopa 37.5mg'].status, S.NEEDS_REVIEW)
        # The controlled-release line is its own medicine; the 2-week
        # 25/100 step has ended, so 50/200 is what is current.
        self.assertEqual(by_name['CARBIDOPA+LEVODOPA 50MG+200MG (SYNDOPA CR)'].status, S.ACTIVE)
        self.assertEqual(by_name['FERRIC CARBOXYMALTOSE 500MG/10ML (ENCICARB)'].status, S.ONE_TIME)
        mecobalamin = by_name['MECOBALAMIN 1500MCG (MECONERV)']
        self.assertEqual(mecobalamin.status, S.COMPLETED)
        self.assertEqual(mecobalamin.end_date, date(2025, 5, 1))
        self.assertFalse(mecobalamin.is_active)

    def test_absence_from_newer_prescriptions_never_discontinues(self):
        self.load_real_history()
        self.rebuild()
        ticagrelor = self.visible().get(generic_name='Ticagrelor')
        pantoprazole = self.visible().get(generic_name='Pantoprazole')
        for medicine in (ticagrelor, pantoprazole):
            self.assertTrue(medicine.is_active)
            self.assertIn(medicine.status, Medication.CURRENT_STATUSES)
            self.assertGreater(medicine.newer_prescriptions_without, 0)
            self.assertIn('still taking', medicine.status_reason)

    def test_conditional_stop_and_temporary_hold_do_not_discontinue(self):
        self.load_real_history()
        self.rebuild()
        cr = self.visible().get(name__contains='SYNDOPA CR')
        self.assertTrue(cr.is_active)
        self.prescription(date(2026, 7, 1), 'Bhat', [rx('Telmisartan 40mg + Indapamide 1.5mg', '', '', 'Withhold on day of surgery')])
        self.rebuild()
        telmisartan = self.visible().get(generic_name='Indapamide + Telmisartan')
        self.assertTrue(telmisartan.is_active)
        self.assertIn('Withhold on day of surgery', telmisartan.status_reason)

    def test_explicit_stop_discontinues_with_evidence(self):
        self.prescription(date(2026, 1, 1), 'Hegde', [rx('Aspirin 75mg', '75mg', 'OD')])
        self.prescription(date(2026, 2, 1), 'Hegde', [rx('Aspirin 75mg', '', '', 'Stop', action='stop', action_text='Stop Ecosprin')])
        aspirin = self.rebuild()['Aspirin']
        self.assertEqual(aspirin.status, Medication.Status.DISCONTINUED)
        self.assertFalse(aspirin.is_active)
        self.assertIn('Stop Ecosprin', aspirin.status_reason)
        self.assertIn('Dr Hegde', aspirin.status_reason)

    def test_dose_change_on_latest_prescription_is_modified(self):
        self.prescription(date(2026, 1, 1), 'Hegde', [rx('Aspirin 75mg', '75mg', 'OD')])
        self.prescription(date(2026, 2, 1), 'Hegde', [rx('Aspirin 150mg', '150mg', 'OD')])
        aspirin = self.rebuild()['Aspirin']
        self.assertEqual(aspirin.status, Medication.Status.MODIFIED)
        self.assertIn('75 mg', aspirin.status_reason)
        self.assertIn('150 mg', aspirin.status_reason)

    def test_two_copies_of_one_prescription_count_once(self):
        lines = [rx('Aspirin 150mg', '150mg', 'OD')]
        self.prescription(date(2026, 1, 1), 'Hegde', lines)
        self.prescription(date(2026, 1, 1), 'Hegde', lines)
        aspirin = self.rebuild()['Aspirin']
        self.assertEqual(aspirin.prescription_count, 1)
        self.assertEqual(aspirin.status, Medication.Status.ACTIVE)
        response = self.client_api.get('/api/medications/', {'profile_id': str(self.profile.id)})
        history = response.data['results'][0]['history']
        self.assertEqual(len(history), 1)
        self.assertEqual(len(history[0]['documents']), 2)

    def test_reprocessing_is_idempotent_and_keeps_reminders(self):
        document = self.prescription(date(2026, 1, 1), 'Hegde', [rx('Aspirin 150mg', '150mg', 'OD')])
        medicine = self.visible().get()
        ReminderSchedule.objects.create(medication=medicine, time_of_day='08:00')
        for _ in range(3):
            rebuild_derived_records(document)
        self.assertEqual(self.visible().count(), 1)
        self.assertEqual(self.visible().get().pk, medicine.pk)
        self.assertEqual(ReminderSchedule.objects.filter(medication=medicine).count(), 1)

    def test_correcting_a_misread_name_leaves_no_stale_row(self):
        document = self.prescription(date(2026, 1, 1), 'Hegde', [rx('Asprin 150mg')])
        document.structured_data = {**document.structured_data, 'medicines': [rx('Aspirin 150mg')]}
        document.save()
        rebuild_derived_records(document)
        self.assertEqual(list(self.visible().values_list('name', flat=True)), ['Aspirin 150mg'])

    def test_deleting_a_prescription_removes_what_only_it_implied(self):
        keep = self.prescription(date(2026, 1, 1), 'Hegde', [rx('Aspirin 150mg')])
        gone = self.prescription(date(2026, 2, 1), 'Hegde', [rx('Aspirin 150mg'), rx('Pantoprazole 40mg')])
        response = self.client_api.delete(f'/api/documents/{gone.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(list(self.visible().values_list('generic_name', flat=True)), ['Aspirin'])
        self.assertEqual(self.visible().get().last_prescribed_on, keep.document_date)

    def test_manual_entry_of_a_prescribed_medicine_is_the_same_record(self):
        self.prescription(date(2026, 1, 1), 'Hegde', [rx('Aspirin 150mg (Ecosprin)', '150mg', 'OD')])
        response = self.client_api.post('/api/medications/', {
            'profile': str(self.profile.id), 'name': 'Ecosprin 150', 'dosage': '1 tablet', 'frequency': 'daily',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self.visible().count(), 1)
        # The app adds its reminder to the id it got back — it must stick.
        reminder = self.client_api.post('/api/reminders/', {'medication': response.data['id'], 'time_of_day': '08:00'}, format='json')
        self.assertEqual(reminder.status_code, 201, reminder.content)
        self.assertEqual(self.visible().get().reminders.count(), 1)

    def test_person_says_stopped_until_a_newer_prescription(self):
        self.prescription(date(2026, 1, 1), 'Hegde', [rx('Aspirin 150mg')])
        medicine = self.visible().get()
        response = self.client_api.post(f'/api/medications/{medicine.id}/set-status/', {'status': 'stopped'}, format='json')
        self.assertEqual(response.data['status'], Medication.Status.DISCONTINUED)
        self.assertFalse(response.data['is_active'])
        # A prescription from the same day does not override the person...
        self.prescription(timezone.localdate(), 'Hegde', [rx('Aspirin 150mg')])
        self.assertFalse(self.visible().get().is_active)
        # ...one dated after they said "stopped" does.
        Medication.objects.filter(pk=medicine.pk).update(user_status_at=timezone.now() - timedelta(days=2))
        self.prescription(timezone.localdate() - timedelta(days=1), 'Hegde', [rx('Aspirin 150mg')])
        self.assertTrue(self.visible().get().is_active)

    def test_still_taking_clears_the_question(self):
        self.prescription(date(2025, 1, 1), 'Hegde', [rx('Pantoprazole 40mg')])
        self.prescription(date(2025, 6, 1), 'Hegde', [rx('Aspirin 150mg')])
        pantoprazole = self.visible().get(generic_name='Pantoprazole')
        self.assertEqual(pantoprazole.newer_prescriptions_without, 1)
        response = self.client_api.post(f'/api/medications/{pantoprazole.id}/set-status/', {'status': 'taking'}, format='json')
        self.assertEqual(response.data['newer_prescriptions_without'], 0)

    def test_merge_keep_separate_and_unmerge(self):
        self.prescription(date(2026, 1, 1), 'Hegde', [rx('Zyxoprin 10mg'), rx('Atorvastatin 10mg')])
        a = self.visible().get(name='Atorvastatin 10mg')
        z = self.visible().get(name='Zyxoprin 10mg')
        response = self.client_api.post(f'/api/medications/{a.id}/merge/', {'other': str(z.id)}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.visible().count(), 1)
        self.assertEqual(self.visible().get().pk, a.pk)
        # Survives every later rebuild.
        self.prescription(date(2026, 2, 1), 'Hegde', [rx('Zyxoprin 10mg')])
        self.assertEqual(self.visible().count(), 1)
        self.client_api.post(f'/api/medications/{a.id}/unmerge/')
        self.assertEqual(self.visible().count(), 2)

    def test_similar_spellings_are_suggested_never_merged(self):
        self.prescription(date(2026, 1, 1), 'Hegde', [rx('Amlodipine 5mg'), rx('Amlodipin 5mg')])
        rows = list(self.visible())
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row.possible_duplicates for row in rows))
        first, second = rows
        self.client_api.post(f'/api/medications/{first.id}/keep-separate/', {'other': str(second.id)}, format='json')
        self.assertTrue(all(not row.possible_duplicates for row in self.visible()))


class MedicationApiTests(ConsolidationTestBase):
    def test_list_defaults_to_current_and_is_not_cut_at_twenty(self):
        self.prescription(date(2026, 1, 1), 'Hegde', [rx(f'Medicine{chr(65 + i)}x 10mg') for i in range(25)])
        self.prescription(date(2026, 1, 2), 'Hegde', [rx('Iron sucrose 100mg', '', 'STAT')])
        response = self.client_api.get('/api/medications/', {'profile_id': str(self.profile.id)})
        self.assertEqual(response.data['count'], 25)
        self.assertEqual(len(response.data['results']), 25)
        past = self.client_api.get('/api/medications/', {'profile_id': str(self.profile.id), 'scope': 'past'})
        self.assertEqual([m['status'] for m in past.data['results']], ['one_time'])
        everything = self.client_api.get('/api/medications/', {'profile_id': str(self.profile.id), 'scope': 'all'})
        self.assertEqual(everything.data['count'], 26)

    def test_statuses_recompute_when_a_course_runs_out(self):
        self.prescription(timezone.localdate() - timedelta(days=3), 'Hegde', [rx('Amoxicillin 500mg', '', 'TDS', '', '5 days')])
        medicine = self.visible().get()
        self.assertTrue(medicine.is_active)
        Medication.objects.filter(pk=medicine.pk).update(status_computed_on=timezone.localdate() - timedelta(days=1))
        # Pretend the course started long ago: it should be complete on the next read.
        MedicationOccurrence.objects.filter(medication=medicine).update(prescribed_on=date(2025, 1, 1))
        response = self.client_api.get('/api/medications/', {'profile_id': str(self.profile.id), 'scope': 'all'})
        self.assertEqual(response.data['results'][0]['status'], Medication.Status.COMPLETED)

    def test_emergency_card_names_each_medicine_once(self):
        from emergency.models import EmergencyProfile
        self.prescription(date(2026, 1, 1), 'Hegde', [rx('Aspirin 75mg (Ecosprin)')])
        self.prescription(date(2026, 2, 1), 'Hegde', [rx('ASPIRIN 75MG')])
        card = EmergencyProfile.objects.create(profile=self.profile, include_medications=True)
        response = self.client.get(f'/api/public/emergency/{card.public_token}/?format=json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['medications'], ['ASPIRIN 75MG'])


class LegacyRowsTests(ConsolidationTestBase):
    """Rows written before consolidation existed: one per document per name."""

    def test_legacy_duplicates_fold_into_one_and_keep_reminders(self):
        documents = [
            Document.objects.create(
                profile=self.profile, title=f'Rx {i}', file=f'documents/legacy{i}.pdf',
                document_date=date(2025, 1, 1) + timedelta(days=30 * i), doctor_name='Hegde',
                structured_data={'medicines': [rx('Aspirin 150mg', '150mg', 'OD')]},
            ) for i in range(4)
        ]
        legacy = [
            Medication.objects.create(profile=self.profile, source_document=doc, name='Aspirin 150mg',
                                      start_date=doc.document_date, origin=Medication.Origin.PRESCRIPTION)
            for doc in documents
        ]
        ReminderSchedule.objects.create(medication=legacy[2], time_of_day='09:00')
        orphan = Medication.objects.create(profile=self.profile, name='ASPIRIN 150MG (ECOSPRIN)',
                                           start_date=date(2025, 6, 1), origin=Medication.Origin.PRESCRIPTION)
        MedicationOccurrence.objects.create(profile=self.profile, medication=orphan, source_deleted=True,
                                            name=orphan.name, prescribed_on=orphan.start_date)

        rebuild_profile_medications(self.profile)

        visible = self.visible()
        self.assertEqual(visible.count(), 1)
        survivor = visible.get()
        self.assertEqual(survivor.pk, legacy[2].pk, 'the row with reminders survives')
        self.assertEqual(survivor.reminders.count(), 1)
        self.assertEqual(survivor.prescription_count, 4)
        self.assertEqual(Medication.objects.filter(profile=self.profile, merged_into=survivor).count(), 4)
        # Nothing was deleted.
        self.assertEqual(Medication.objects.filter(profile=self.profile).count(), 5)
        history = self.client_api.get('/api/medications/', {'profile_id': str(self.profile.id)}).data['results'][0]['history']
        self.assertTrue(any(entry['source_deleted'] for entry in history))
