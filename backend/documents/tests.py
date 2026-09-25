"""
The document pipeline: resilience when AI is unavailable, and the Timeline
and Medication rows derived from an upload.

Both were real gaps. Uploading a document returned a 500 whenever
ANTHROPIC_API_KEY held a value that did not work, and nothing in the running
application ever created a TimelineEvent or a Medication — only the demo
seed command did, so the Health Timeline was permanently empty for any real
account.
"""

import io
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Account
from ai.claude_service import ClaudeService, ClaudeUnavailable
from documents.models import Document, TimelineEvent
from family.models import Profile
from medicines.models import Medication, ReminderSchedule


def text_pdf(text='Prescription from Dr Priya Nair at City Hospital'):
    """A real one-page PDF with an embedded text layer, so pypdf extracts
    something and the pipeline reaches the structuring step."""
    content = f'BT /F1 12 Tf 72 720 Td ({text}) Tj ET'.encode()
    objs = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
        b'/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    out = io.BytesIO()
    out.write(b'%PDF-1.4\n')
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(f'{i} 0 obj\n'.encode() + body + b'\nendobj\n')
    xref = out.tell()
    out.write(f'xref\n0 {len(objs) + 1}\n'.encode())
    out.write(b'0000000000 65535 f \n')
    for off in offsets:
        out.write(f'{off:010d} 00000 n \n'.encode())
    out.write(f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    return out.getvalue()


PRESCRIPTION_RESULT = {
    'doctor_name': 'Priya Nair',
    'hospital_name': 'City Hospital',
    'date': '2026-03-14',
    'diagnosis': ['Hypertension'],
    'medicines': [
        {'name': 'Amlodipine 5mg', 'dosage': '1 tablet', 'frequency': 'once daily',
         'instructions': 'After food'},
    ],
    'tests': ['Lipid profile'],
    'follow_up_date': None,
}


class DocumentPipelineTests(TestCase):
    def setUp(self):
        self.account = Account.objects.create_user(phone_number='+919000001111')
        self.profile = Profile.objects.create(
            account=self.account, full_name='Test Patient', relation='self'
        )
        self.client_api = APIClient()
        self.client_api.credentials(
            HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(self.account).access_token)
        )

    def upload(self, category='prescription', title='Test Rx', text=None):
        return self.client_api.post(
            '/api/documents/',
            {'profile': str(self.profile.id),
             'file': SimpleUploadedFile('rx.pdf', text_pdf(text) if text else text_pdf(),
                                        content_type='application/pdf'),
             'category': category, 'title': title},
            format='multipart',
        )

    # -- resilience ----------------------------------------------------

    @override_settings(ANTHROPIC_API_KEY='sk-ant-a-key-that-does-not-work')
    def test_upload_survives_a_rejected_api_key(self):
        """
        The exact production failure: a key is present but invalid, so
        `enabled` is True and the request 401s. That used to surface as a
        500 from the upload itself.
        """
        with patch.object(ClaudeService, '_call',
                          side_effect=ClaudeUnavailable('The configured Claude API key was rejected.')):
            response = self.upload()

        self.assertEqual(response.status_code, 201)
        document = Document.objects.get(pk=response.data['id'])
        self.assertEqual(document.status, Document.Status.NEEDS_REVIEW)
        self.assertTrue(document.structured_data.get('_extraction_failed'))
        self.assertIn('rejected', document.structured_data.get('note', ''))
        # The file itself is kept — the upload was not wasted.
        self.assertTrue(document.file)
        self.assertTrue(document.raw_ocr_text)

    @override_settings(ANTHROPIC_API_KEY='')
    def test_upload_works_with_no_api_key_at_all(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201)
        document = Document.objects.get(pk=response.data['id'])
        self.assertEqual(document.status, Document.Status.NEEDS_REVIEW)
        self.assertTrue(document.structured_data.get('_mock'))

    @override_settings(ANTHROPIC_API_KEY='sk-ant-key')
    def test_upload_survives_unparseable_ai_output(self):
        with patch.object(ClaudeService, '_call', return_value='this is not JSON at all'):
            response = self.upload()
        self.assertEqual(response.status_code, 201)
        document = Document.objects.get(pk=response.data['id'])
        self.assertTrue(document.structured_data.get('_extraction_failed'))

    @override_settings(ANTHROPIC_API_KEY='')
    def test_upload_survives_a_file_with_no_readable_text(self):
        response = self.client_api.post(
            '/api/documents/',
            {'profile': str(self.profile.id),
             'file': SimpleUploadedFile('scan.pdf', b'%PDF-1.4 no text layer',
                                        content_type='application/pdf'),
             'category': 'scan', 'title': 'Scan'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201)
        document = Document.objects.get(pk=response.data['id'])
        self.assertTrue(document.structured_data.get('_extraction_failed'))
        # Even unreadable, it is still a real event on the record.
        self.assertEqual(TimelineEvent.objects.filter(source_document=document).count(), 1)

    # -- derived records -----------------------------------------------

    @override_settings(ANTHROPIC_API_KEY='')
    def test_every_upload_produces_a_timeline_event(self):
        """The Timeline was empty for every real account before this."""
        self.assertEqual(TimelineEvent.objects.filter(profile=self.profile).count(), 0)
        response = self.upload(category='report', title='Blood Report')
        document = Document.objects.get(pk=response.data['id'])

        events = TimelineEvent.objects.filter(source_document=document)
        self.assertEqual(events.count(), 1)
        self.assertEqual(events.first().title, 'Blood Report')
        self.assertEqual(events.first().event_type, 'report')

    @override_settings(ANTHROPIC_API_KEY='sk-ant-key')
    def test_a_prescription_creates_medicines_diagnoses_and_tests(self):
        import json
        with patch.object(ClaudeService, '_call', return_value=json.dumps(PRESCRIPTION_RESULT)):
            response = self.upload()

        document = Document.objects.get(pk=response.data['id'])

        # Extracted header fields land on the columns the app displays.
        self.assertEqual(document.doctor_name, 'Priya Nair')
        self.assertEqual(document.hospital_name, 'City Hospital')
        self.assertEqual(str(document.document_date), '2026-03-14')

        titles = set(TimelineEvent.objects.filter(source_document=document)
                     .values_list('title', flat=True))
        self.assertIn('Test Rx', titles)         # the document itself
        self.assertIn('Hypertension', titles)    # the diagnosis
        self.assertIn('Lipid profile', titles)   # the test

        medicine = Medication.objects.get(profile=self.profile, name='Amlodipine 5mg')
        self.assertEqual(medicine.dosage, '1 tablet')
        self.assertEqual(medicine.frequency, 'once daily')
        self.assertEqual(medicine.source_document_id, document.id)
        self.assertTrue(medicine.is_active)

    @override_settings(ANTHROPIC_API_KEY='sk-ant-key')
    def test_reprocessing_does_not_duplicate_or_destroy_reminders(self):
        """
        Rebuilding must be idempotent, and must never delete a Medication:
        ReminderSchedule cascades off it, so a delete-and-recreate would
        silently wipe reminder times the person set by hand.
        """
        import json
        from documents.derived import rebuild_derived_records

        with patch.object(ClaudeService, '_call', return_value=json.dumps(PRESCRIPTION_RESULT)):
            response = self.upload()
        document = Document.objects.get(pk=response.data['id'])

        medicine = Medication.objects.get(profile=self.profile, name='Amlodipine 5mg')
        ReminderSchedule.objects.create(medication=medicine, time_of_day='08:00')

        events_before = TimelineEvent.objects.filter(source_document=document).count()
        rebuild_derived_records(document)

        self.assertEqual(TimelineEvent.objects.filter(source_document=document).count(),
                         events_before)
        self.assertEqual(Medication.objects.filter(profile=self.profile,
                                                   name='Amlodipine 5mg').count(), 1)
        self.assertEqual(ReminderSchedule.objects.filter(medication=medicine).count(), 1,
                         'the hand-set reminder must survive a rebuild')

    @override_settings(ANTHROPIC_API_KEY='')
    def test_malformed_extraction_shapes_do_not_crash_the_rebuild(self):
        """
        The model is instructed to return lists but is not bound to. A bare
        string where a list belongs must not break an upload.
        """
        from documents.derived import rebuild_derived_records

        response = self.upload()
        document = Document.objects.get(pk=response.data['id'])
        document.structured_data = {
            'diagnosis': 'Hypertension',                 # string, not a list
            'medicines': 'Amlodipine 5mg',               # string, not a list
            'tests': None,                               # null, not a list
            'date': 'not-a-real-date',
        }
        document.save()

        rebuild_derived_records(document)  # must not raise

        titles = set(TimelineEvent.objects.filter(source_document=document)
                     .values_list('title', flat=True))
        self.assertIn('Hypertension', titles)
        self.assertTrue(Medication.objects.filter(name='Amlodipine 5mg').exists())

    @override_settings(ANTHROPIC_API_KEY='')
    def test_correcting_a_document_updates_what_it_derived(self):
        response = self.upload()
        document = Document.objects.get(pk=response.data['id'])

        self.client_api.patch(
            f'/api/documents/{document.id}/correct/',
            {'structured_data': {'diagnosis': ['Corrected Diagnosis']}},
            format='json',
        )

        titles = set(TimelineEvent.objects.filter(source_document=document)
                     .values_list('title', flat=True))
        self.assertIn('Corrected Diagnosis', titles)

    @override_settings(ANTHROPIC_API_KEY='')
    def test_derived_records_are_visible_through_the_timeline_api(self):
        """What the mobile Timeline screen actually reads."""
        self.upload(category='report', title='Blood Report')
        response = self.client_api.get('/api/timeline/', {'profile_id': str(self.profile.id)})
        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.data['results']), 0)
