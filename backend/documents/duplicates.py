"""
Recognising a document that is already in the locker.

Three levels, strictest first. A filename is never evidence — two different
prescriptions are routinely both called "prescription.pdf", and hospital
portals name every download "Caches_AMB-…".

1. Exact file: the SHA-256 of the bytes matches a document already on this
   profile. Nothing is stored or processed again; the upload resolves to
   the existing document (documents/views.py).

2. Same content: a different file (re-downloaded, re-printed) whose every
   page has the same text once volatile lines such as "Printed on …" and
   page numbers are removed. The file is kept for traceability but linked
   as a copy, so it adds nothing to the timeline or the medicines list.

3. Possible duplicate: some pages shared, or very similar text. Both are
   kept and processed — unique content is never discarded — and the person
   is asked to confirm. Medicine history additionally collapses identical
   lines from the same date and doctor (medicines/consolidation.py), so an
   unconfirmed overlap still cannot double-count a medicine.
"""

import hashlib
import re
from dataclasses import dataclass

PAGE_FINGERPRINT_LENGTH = 32
# Pages-in-common or text similarity at or above this is worth asking about.
SIMILAR_TEXT_THRESHOLD = 0.8

_VOLATILE_LINE = re.compile(
    r'(printed\s+(on|by|at)|print\s+(date|time)|date\s+of\s+print|generated\s+(on|by|at)|'
    r'downloaded\s+(on|at)|report\s+generated|page\s+\d+\s*(of|/)\s*\d+|^\s*page\s*\d+\s*$)',
    re.IGNORECASE,
)


def file_digest(uploaded_file):
    """(sha256 hex, size in bytes) of an uploaded or stored file, read in chunks."""
    digest = hashlib.sha256()
    size = 0
    if hasattr(uploaded_file, 'seek'):
        uploaded_file.seek(0)
    chunks = uploaded_file.chunks() if hasattr(uploaded_file, 'chunks') else iter(lambda: uploaded_file.read(65536), b'')
    for chunk in chunks:
        digest.update(chunk)
        size += len(chunk)
    if hasattr(uploaded_file, 'seek'):
        uploaded_file.seek(0)
    return digest.hexdigest(), size


def normalize_text(text):
    lines = [line for line in (text or '').splitlines() if not _VOLATILE_LINE.search(line)]
    return re.sub(r'\s+', ' ', ' '.join(lines)).strip().lower()


def page_fingerprints(pages):
    fingerprints = []
    for page in pages or []:
        normalized = normalize_text(page)
        fingerprints.append(
            hashlib.sha256(normalized.encode()).hexdigest()[:PAGE_FINGERPRINT_LENGTH] if normalized else ''
        )
    return fingerprints


def _shingles(text, size=5):
    words = normalize_text(text).split()
    if len(words) < size:
        return {' '.join(words)} if words else set()
    return {' '.join(words[i:i + size]) for i in range(len(words) - size + 1)}


def text_similarity(a, b):
    first, second = _shingles(a), _shingles(b)
    if not first or not second:
        return 0.0
    return len(first & second) / len(first | second)


@dataclass
class ContentMatch:
    document: object
    kind: str            # 'same_content' or 'possible'
    score: float
    shared_pages: list   # 1-based page numbers of THIS document found in the other


def find_content_match(document):
    """
    The best content-level match for `document` among the other original
    documents on its profile, or None. Requires page_fingerprints and
    raw_ocr_text to be set on `document` already.
    """
    from .models import Document

    if document.duplicate_check_dismissed:
        return None
    mine = [f for f in document.page_fingerprints or [] if f]
    if not mine and not document.raw_ocr_text:
        return None

    candidates = (
        Document.objects.filter(profile_id=document.profile_id, duplicate_of__isnull=True)
        .exclude(pk=document.pk)
        .only('id', 'title', 'uploaded_at', 'page_fingerprints', 'raw_ocr_text')
        .order_by('uploaded_at')
    )
    best = None
    for other in candidates:
        theirs = [f for f in other.page_fingerprints or [] if f]
        if mine and mine == theirs:
            return ContentMatch(other, 'same_content', 1.0, list(range(1, len(document.page_fingerprints) + 1)))
        shared = set(mine) & set(theirs)
        if shared:
            score = len(shared) / len(set(mine) | set(theirs))
            pages = [i + 1 for i, f in enumerate(document.page_fingerprints) if f in shared]
            match = ContentMatch(other, 'possible', round(score, 3), pages)
        else:
            score = text_similarity(document.raw_ocr_text, other.raw_ocr_text)
            if score < SIMILAR_TEXT_THRESHOLD:
                continue
            match = ContentMatch(other, 'possible', round(score, 3), [])
        if best is None or match.score > best.score:
            best = match
    return best


def find_exact_original(profile_id, sha256):
    """The original document on this profile with exactly these bytes, or None."""
    from .models import Document

    if not sha256:
        return None
    match = (
        Document.objects.filter(profile_id=profile_id, file_sha256=sha256)
        .select_related('duplicate_of')
        .order_by('uploaded_at')
        .first()
    )
    if match is None:
        return None
    return match.duplicate_of or match
