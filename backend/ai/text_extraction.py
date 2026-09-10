"""
Text extraction for uploaded files (insurance policies, medical
documents) — the step that has to happen before Claude can structure
anything, since Claude only ever sees text, never the raw file.

PDF extraction is real and works right now: pypdf reads a PDF's own
embedded text layer directly, no external API or cost involved. This
covers the common real-world case — most insurers and hospitals issue
digitally-generated PDFs, not scanned images, so their text is already
embedded in the file rather than needing to be recognized from pixels.

Image OCR (a photo of a printed page) is a genuinely different problem —
recognizing text from pixels requires a real OCR service (Google Vision,
AWS Textract). That's not configured anywhere in this project yet (see
OCR_PROVIDER_API_KEY in .env — same situation as the rest of the app's
document AI), so this honestly returns None with a clear reason rather
than pretending to have read something it didn't. Once a real provider
key is added, extract_text_from_image is the one function to fill in —
nothing else in this file needs to change.
"""
import os

from pypdf import PdfReader
from pypdf.errors import PdfReadError


class ExtractionResult:
    def __init__(self, text: str | None, method: str, note: str | None = None):
        self.text = text
        self.method = method  # 'pdf_native', 'ocr', or 'unavailable'
        self.note = note

    @property
    def succeeded(self) -> bool:
        return bool(self.text)


def extract_text_from_pdf(file_obj) -> ExtractionResult:
    """
    Reads a PDF's own embedded text directly — works for any digitally-
    generated PDF (the vast majority of real insurance policy documents).
    Does NOT work for a PDF that's just a scan of a paper document with no
    text layer at all — that case is reported honestly via method
    'unavailable' rather than silently returning nothing with no
    explanation, since a scanned-PDF and a "this isn't a PDF" failure
    should not look identical to the caller.

    A real, common case this also has to handle: a PDF that's a MIX —
    a few digitally-generated pages (a cover letter, a policy schedule
    with the customer's name and policy number) followed by many pages
    that are actually scanned images of the full terms document, common
    with Indian insurers who attach a standard scanned wording booklet.
    Naively concatenating "whatever text came back" makes this look like
    a complete, successful extraction even though entire pages
    contributed nothing — which is exactly why a real upload can show a
    correct policy number and dates while Exclusions/Waiting Periods/
    Sub-Limits stay empty: those clauses were on pages that never had
    readable text to begin with. Now tracked and reported explicitly.
    """
    try:
        file_obj.seek(0)
        reader = PdfReader(file_obj)
        pages_text = [page.extract_text() or '' for page in reader.pages]
        total_pages = len(pages_text)
        empty_pages = sum(1 for t in pages_text if not t.strip())
        combined = '\n\n'.join(t.strip() for t in pages_text if t.strip())
    except PdfReadError:
        return ExtractionResult(None, 'unavailable', 'Could not read this file as a PDF — it may be corrupted.')
    finally:
        file_obj.seek(0)

    if not combined:
        return ExtractionResult(
            None,
            'unavailable',
            'This PDF has no embedded text (likely a scan of a paper document). '
            'Image-based OCR would be needed, which is not configured yet.',
        )

    result = ExtractionResult(combined, 'pdf_native')
    # More than one empty page suggests a genuine mixed document, not
    # just an odd blank page — a single blank page is common and not
    # worth flagging, but several strongly suggests a scanned annexure.
    if empty_pages > 1:
        result.note = (
            f'{empty_pages} of {total_pages} pages in this PDF had no readable text — '
            'likely scanned images (e.g. a standard terms booklet attached to a digital schedule). '
            'Only the text-based pages could be extracted; some clauses (exclusions, waiting periods, '
            'sub-limits) may be missing from what was analyzed if they were on those pages. '
            'OCR would be needed to read them, and is not configured yet.'
        )
    return result


def extract_text_from_image(file_obj) -> ExtractionResult:
    """
    Genuinely not implemented — real OCR requires an external provider
    (Google Vision / AWS Textract) that isn't wired up in this project.
    Honest by design: returns None with a clear reason rather than
    fabricating extracted text, matching how the rest of the app's
    document AI behaves when ANTHROPIC_API_KEY isn't set either.
    """
    if not os.getenv('OCR_PROVIDER_API_KEY'):
        return ExtractionResult(
            None,
            'unavailable',
            'Image OCR is not configured yet (OCR_PROVIDER_API_KEY is unset). '
            'This file was accepted and saved, but its text could not be extracted automatically — '
            'add the details yourself, or upload a text-based PDF instead.',
        )
    # A key is set but the real provider call was never written — this is
    # a genuinely half-configured state (someone added a key expecting it
    # to "just work"). Reported the same honest way as the unset case,
    # rather than letting a raw NotImplementedError surface as an
    # unhandled 500 on upload — the person adding a key shouldn't be the
    # one who discovers this gap via a crash.
    #
    # Real call goes here once someone wires it up:
    # raw_text = call_vision_api(file_obj)
    # return ExtractionResult(raw_text, 'ocr')
    return ExtractionResult(
        None,
        'unavailable',
        'An OCR provider key is set, but the real OCR call has not been implemented yet — '
        'this needs a developer to finish wiring extract_text_from_image() before image uploads can be read. '
        'This file was accepted and saved either way; add the details yourself for now.',
    )


def extract_text(file_field) -> ExtractionResult:
    """
    Entry point — picks the right extractor based on the uploaded file's
    actual extension, so callers (insurance upload, document upload)
    don't need to know the difference.
    """
    name = (file_field.name or '').lower()
    if name.endswith('.pdf'):
        return extract_text_from_pdf(file_field)
    if name.endswith(('.jpg', '.jpeg', '.png')):
        return extract_text_from_image(file_field)
    return ExtractionResult(None, 'unavailable', f'Unsupported file type for text extraction: {name}')
