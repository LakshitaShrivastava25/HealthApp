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


@patch.object(ClaudeService, 'process_document', lambda self, document: None)
class StoredFileTests(TestCase):
    """
    "View original file" used to 404 in production: files were written to
    Render's ephemeral disk and /media/ was only routed with DEBUG on. Files
    now live in the database behind a signed, expiring link.
    """

    def setUp(self):
        self.account = Account.objects.create_user(phone_number='+919000002222')
        self.profile = Profile.objects.create(
            account=self.account, full_name='Test Patient', relation='self'
        )
        self.client_api = APIClient()
        self.client_api.credentials(
            HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(self.account).access_token)
        )
        self.pdf = text_pdf()

    def upload(self):
        response = self.client_api.post(
            '/api/documents/',
            {'profile': str(self.profile.id),
             'file': SimpleUploadedFile('rx.pdf', self.pdf, content_type='application/pdf'),
             'category': 'prescription', 'title': 'Rx'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.data['file']

    @override_settings(DEBUG=False)
    def test_uploaded_file_opens_from_returned_link_without_auth(self):
        url = self.upload()
        self.assertIn('/api/files/?t=', url)
        # Opened in a browser tab / Linking.openURL — no JWT header.
        response = APIClient().get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, self.pdf)
        self.assertEqual(response['Content-Type'], 'application/pdf')

    def test_link_from_detail_endpoint_also_opens(self):
        self.upload()
        doc = Document.objects.get(profile=self.profile)
        url = self.client_api.get(f'/api/documents/{doc.id}/').data['file']
        self.assertEqual(APIClient().get(url).content, self.pdf)

    def test_tampered_or_missing_token_is_rejected(self):
        url = self.upload()
        self.assertEqual(APIClient().get(url[:-2] + 'xx').status_code, 404)
        self.assertEqual(APIClient().get('/api/files/').status_code, 404)

    def test_expired_link_is_rejected(self):
        url = self.upload()
        with patch('documents.files.FILE_URL_MAX_AGE', -1):
            self.assertEqual(APIClient().get(url).status_code, 404)

    def test_https_scheme_behind_proxy(self):
        response = self.client_api.post(
            '/api/documents/',
            {'profile': str(self.profile.id),
             'file': SimpleUploadedFile('rx.pdf', self.pdf, content_type='application/pdf'),
             'category': 'prescription'},
            format='multipart', HTTP_X_FORWARDED_PROTO='https',
        )
        self.assertTrue(response.data['file'].startswith('https://'))

    def test_file_is_fetchable_by_the_web_viewer(self):
        """The web viewer reads the file with fetch() (pdf.js) or <img>, never a frame."""
        response = APIClient().get(self.upload(), HTTP_ORIGIN='http://localhost:5173')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Access-Control-Allow-Origin'], 'http://localhost:5173')
        self.assertEqual(response['X-Frame-Options'], 'DENY')

    def test_file_type_tells_the_apps_which_viewer_to_use(self):
        self.upload()
        doc = Document.objects.get(profile=self.profile)
        self.assertEqual(self.client_api.get(f'/api/documents/{doc.id}/').data['file_type'], 'pdf')

    def test_file_kind(self):
        from documents.validators import file_kind
        self.assertEqual(file_kind('documents/2026/10/rx_1a2b3c4d.PDF'), 'pdf')
        self.assertEqual(file_kind('documents/x.jpeg'), 'image')
        self.assertEqual(file_kind('documents/x.heic'), 'heic')
        self.assertEqual(file_kind(''), '')


@override_settings(CLOUDINARY_CLOUD_NAME='demo', CLOUDINARY_API_KEY='k', CLOUDINARY_API_SECRET='s')
class CloudinaryStorageTests(TestCase):
    """The production backend, with the SDK mocked so no real upload happens."""

    def setUp(self):
        from documents.storage import CloudinaryStorage
        self.storage = CloudinaryStorage()

    @patch('cloudinary.uploader.upload')
    def test_upload_is_private_raw_and_name_is_unique(self, upload):
        upload.side_effect = lambda data, public_id, **kw: {'public_id': public_id}
        name = self.storage.save('documents/2026/10/rx.pdf', SimpleUploadedFile('rx.pdf', b'%PDF'))
        kwargs = upload.call_args.kwargs
        self.assertEqual((kwargs['resource_type'], kwargs['type']), ('raw', 'authenticated'))
        self.assertEqual(upload.call_args.args[0], b'%PDF')
        self.assertRegex(name, r'^documents/2026/10/rx_[0-9a-f]{8}\.pdf$')
        self.assertNotEqual(name, self.storage.save('documents/2026/10/rx.pdf', SimpleUploadedFile('rx.pdf', b'%PDF')))

    def test_long_names_fit_the_field(self):
        self.assertLessEqual(len(self.storage.get_available_name('documents/' + 'a' * 200 + '.pdf', 100)), 100)

    @patch('urllib.request.urlopen')
    def test_open_fetches_through_signed_expiring_download_link(self, urlopen):
        urlopen.return_value.__enter__.return_value.read.return_value = b'%PDF'
        self.assertEqual(self.storage.open('documents/rx_1.pdf').read(), b'%PDF')
        url = urlopen.call_args.args[0]
        self.assertIn('/raw/download?', url)
        self.assertIn('type=authenticated', url)
        self.assertIn('expires_at=', url)
        self.assertIn('signature=', url)

    def test_url_points_at_our_signed_endpoint_not_cloudinary(self):
        self.assertTrue(self.storage.url('documents/rx_1.pdf').startswith('/api/files/?t='))


class StoredFileCleanupTests(TestCase):
    """Deleting a document used to leave its file in storage forever."""

    def setUp(self):
        self.account = Account.objects.create_user(phone_number='+919000003333')
        self.profile = Profile.objects.create(account=self.account, full_name='Test Patient', relation='self')
        self.client_api = APIClient()
        self.client_api.credentials(
            HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(self.account).access_token)
        )

    @override_settings(ANTHROPIC_API_KEY='')
    def test_deleting_document_deletes_its_file(self):
        response = self.client_api.post(
            '/api/documents/',
            {'profile': str(self.profile.id),
             'file': SimpleUploadedFile('rx.pdf', text_pdf(), content_type='application/pdf'),
             'category': 'prescription', 'title': 'Rx'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.content)
        doc = Document.objects.get(profile=self.profile)
        storage, name = doc.file.storage, doc.file.name
        self.assertTrue(storage.exists(name))

        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client_api.delete(f'/api/documents/{doc.id}/').status_code, 204)
        self.assertFalse(storage.exists(name))

    def test_storage_failure_does_not_fail_the_delete(self):
        doc = Document.objects.create(profile=self.profile, title='Rx', file='documents/missing.pdf')
        with patch('documents.storage.DatabaseStorage.delete', side_effect=RuntimeError('down')):
            with self.captureOnCommitCallbacks(execute=True):
                doc.delete()
        self.assertFalse(Document.objects.filter(pk=doc.pk).exists())


def pdf_pages(pages):
    """A multi-page PDF; each page a list of text lines."""
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', None]
    kids = []
    font_id = 3 + 2 * len(pages)
    for i, lines in enumerate(pages):
        page_id, content_id = 3 + 2 * i, 4 + 2 * i
        kids.append(f'{page_id} 0 R')
        content = ' '.join(['BT /F1 12 Tf 72 720 Td 14 TL'] + [f'({line}) Tj T*' for line in lines] + ['ET']).encode()
        objs.append(
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
            f'/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>'.encode()
        )
        objs.append(b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream')
    objs[1] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(pages)} >>'.encode()
    objs.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
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


def ai_result(*medicines, date='2026-06-03', doctor='Vikram Huded'):
    import json
    return json.dumps({
        'doctor_name': doctor, 'hospital_name': None, 'date': date, 'diagnosis': [],
        'medicines': [{'name': name, 'dosage': None, 'frequency': 'OD', 'instructions': None} for name in medicines],
        'tests': [], 'follow_up_date': None,
    })


PAGE_ONE = ['Dr Vikram Huded', 'Aspirin 150mg once daily after food', 'Printed on 08/10/2026 16:30']
PAGE_ONE_REPRINT = ['Dr Vikram Huded', 'Aspirin 150mg once daily after food', 'Printed on 09/10/2026 10:05']
PAGE_TWO = ['Follow up after review', 'Amantadine 100mg once daily']


@override_settings(ANTHROPIC_API_KEY='sk-ant-key')
class DuplicateDocumentTests(TestCase):
    """
    The same prescription uploaded two or three times — under the same
    name, another name, or as a re-downloaded copy — must not become several
    documents, several timeline entries and several copies of each medicine.
    """

    def setUp(self):
        self.account = Account.objects.create_user(phone_number='+919000005555')
        self.profile = Profile.objects.create(account=self.account, full_name='Mother', relation='parent')
        self.client_api = APIClient()
        self.client_api.credentials(
            HTTP_AUTHORIZATION='Bearer ' + str(RefreshToken.for_user(self.account).access_token)
        )

    def upload(self, data, filename='rx.pdf'):
        return self.client_api.post(
            '/api/documents/',
            {'profile': str(self.profile.id),
             'file': SimpleUploadedFile(filename, data, content_type='application/pdf'),
             'category': 'prescription', 'title': filename},
            format='multipart',
        )

    def medicines(self):
        return Medication.objects.filter(profile=self.profile, merged_into__isnull=True, is_archived=False)

    def test_exact_same_file_under_another_name_is_not_added_again(self):
        data = pdf_pages([PAGE_ONE])
        with patch.object(ClaudeService, '_call', return_value=ai_result('Aspirin 150mg')) as call:
            first = self.upload(data, 'Caches_AMB-1002-26349476.pdf')
            second = self.upload(data, 'mum prescription june.pdf')
            third = self.upload(data, 'Caches_AMB-1002-26349476.pdf')

        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(first.data['upload']['outcome'], 'new')
        for again in (second, third):
            self.assertEqual(again.status_code, 200, again.content)
            self.assertEqual(again.data['id'], first.data['id'])
            self.assertEqual(again.data['upload']['outcome'], 'exact_duplicate')
        self.assertEqual(call.call_count, 1, 'the AI is paid for once')
        self.assertEqual(Document.objects.filter(profile=self.profile).count(), 1)
        self.assertEqual(self.medicines().count(), 1)
        history = self.client_api.get(f'/api/documents/{first.data["id"]}/').data['upload_history']
        self.assertEqual([h['original_filename'] for h in history],
                         ['Caches_AMB-1002-26349476.pdf', 'mum prescription june.pdf', 'Caches_AMB-1002-26349476.pdf'])

    def test_same_filename_with_different_content_is_a_new_document(self):
        with patch.object(ClaudeService, '_call', side_effect=[ai_result('Aspirin 150mg'), ai_result('Amantadine 100mg')]):
            first = self.upload(pdf_pages([PAGE_ONE]), 'prescription.pdf')
            second = self.upload(pdf_pages([PAGE_TWO]), 'prescription.pdf')
        self.assertEqual((first.status_code, second.status_code), (201, 201))
        self.assertNotEqual(first.data['id'], second.data['id'])
        self.assertIsNone(second.data['duplicate_of'])
        self.assertEqual(self.medicines().count(), 2)

    def test_reprinted_copy_is_linked_and_adds_nothing(self):
        with patch.object(ClaudeService, '_call', return_value=ai_result('Aspirin 150mg')) as call:
            original = self.upload(pdf_pages([PAGE_ONE]))
            copy = self.upload(pdf_pages([PAGE_ONE_REPRINT]))

        self.assertEqual(copy.status_code, 201)
        self.assertEqual(str(copy.data['duplicate_of']), str(original.data['id']))
        self.assertEqual(copy.data['duplicate_kind'], 'same_content')
        self.assertEqual(call.call_count, 1, 'a verified copy reuses what was already read')
        self.assertEqual(TimelineEvent.objects.filter(source_document_id=copy.data['id']).count(), 0)
        self.assertEqual(self.medicines().count(), 1)
        # Kept for traceability, listed under its original rather than beside it.
        listing = self.client_api.get('/api/documents/', {'profile_id': str(self.profile.id)}).data['results']
        self.assertEqual([d['id'] for d in listing], [original.data['id']])
        self.assertEqual([c['id'] for c in listing[0]['copies']], [copy.data['id']])

    def test_overlapping_pdf_is_flagged_and_its_unique_content_kept(self):
        with patch.object(ClaudeService, '_call', side_effect=[
            ai_result('Aspirin 150mg'), ai_result('Aspirin 150mg', 'Amantadine 100mg'),
        ]):
            first = self.upload(pdf_pages([PAGE_ONE]))
            bundle = self.upload(pdf_pages([PAGE_ONE_REPRINT, PAGE_TWO]))

        self.assertIsNone(bundle.data['duplicate_of'], 'unique pages mean it is not a copy')
        self.assertEqual(bundle.data['possible_duplicate']['id'], first.data['id'])
        self.assertEqual(bundle.data['possible_duplicate']['shared_pages'], [1])
        names = sorted(self.medicines().values_list('generic_name', flat=True))
        self.assertEqual(names, ['Amantadine', 'Aspirin'])
        aspirin = self.medicines().get(generic_name='Aspirin')
        self.assertEqual(aspirin.prescription_count, 1, 'the shared page is one prescription, not two')

    def test_mark_and_unmark_as_duplicate(self):
        with patch.object(ClaudeService, '_call', side_effect=[ai_result('Aspirin 150mg'), ai_result('Aspirin 150mg', doctor='V Huded')]):
            first = self.upload(pdf_pages([PAGE_ONE]))
            second = self.upload(pdf_pages([['Different layout entirely', 'Ecosprin 150 daily']]))
        url = f'/api/documents/{second.data["id"]}/'
        response = self.client_api.post(url + 'mark-duplicate/', {'of': first.data['id']}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['duplicate_kind'], 'manual')
        self.assertEqual(TimelineEvent.objects.filter(source_document_id=second.data['id']).count(), 0)

        response = self.client_api.post(url + 'not-duplicate/')
        self.assertIsNone(response.data['duplicate_of'])
        self.assertGreater(TimelineEvent.objects.filter(source_document_id=second.data['id']).count(), 0)

    def test_deleting_the_original_promotes_its_copy(self):
        with patch.object(ClaudeService, '_call', return_value=ai_result('Aspirin 150mg')):
            original = self.upload(pdf_pages([PAGE_ONE]))
            copy = self.upload(pdf_pages([PAGE_ONE_REPRINT]))
        self.assertEqual(self.client_api.delete(f'/api/documents/{original.data["id"]}/').status_code, 204)
        promoted = Document.objects.get(pk=copy.data['id'])
        self.assertIsNone(promoted.duplicate_of)
        self.assertGreater(TimelineEvent.objects.filter(source_document=promoted).count(), 0)
        self.assertEqual(self.medicines().count(), 1, 'the prescription is still on record')

    def test_filename_title_is_replaced_by_a_readable_one(self):
        with patch.object(ClaudeService, '_call', return_value=ai_result('Aspirin 150mg')):
            response = self.upload(pdf_pages([PAGE_ONE]), 'Caches_AMB-1002-26349476.pdf')
        self.assertEqual(response.data['title'], 'Prescription · Dr Vikram Huded · 3 Jun 2026')
        self.assertEqual(response.data['original_filename'], 'Caches_AMB-1002-26349476.pdf')

    def test_backfill_links_copies_uploaded_before_detection_existed(self):
        """What production already holds: the same file stored twice, unlinked."""
        import json
        from datetime import date

        from django.core.management import call_command

        from documents.derived import rebuild_derived_records

        data = pdf_pages([PAGE_ONE])
        documents = []
        for minute in (30, 47):
            document = Document.objects.create(
                profile=self.profile, title='Caches_AMB-1002-26349476.pdf', category='prescription',
                file=SimpleUploadedFile('Caches_AMB-1002-26349476.pdf', data),
                document_date=date(2026, 6, 3), doctor_name='Vikram Huded',
                status=Document.Status.PROCESSED, structured_data=json.loads(ai_result('Aspirin 150mg')),
            )
            rebuild_derived_records(document)
            documents.append(document)
        first, second = documents

        out = io.StringIO()
        call_command('backfill_document_fingerprints', stdout=out)
        self.assertIn('EXACT copy', out.getvalue())
        self.assertIsNone(Document.objects.get(pk=second.pk).duplicate_of, 'a dry run changes nothing')

        call_command('backfill_document_fingerprints', '--apply', stdout=io.StringIO())
        copy = Document.objects.get(pk=second.pk)
        self.assertEqual(copy.duplicate_of_id, first.pk)
        self.assertEqual(copy.duplicate_kind, Document.DuplicateKind.EXACT)
        self.assertTrue(copy.file_sha256)
        self.assertEqual(TimelineEvent.objects.filter(source_document=copy).count(), 0)
        self.assertTrue(Document.objects.filter(pk=copy.pk).exists(), 'the file is kept')
        self.assertEqual(self.medicines().count(), 1)
