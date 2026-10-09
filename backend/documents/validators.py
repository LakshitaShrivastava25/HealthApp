"""
What may be uploaded: medical documents, insurance policies and doctor
licences are PDFs or photos, so nothing else is accepted.

Before this, any file was stored and later served back from the API's own
origin with a Content-Type guessed from its name. A "licence" named
licence.html or licence.svg therefore ran as a web page on the backend
origin the moment an admin opened it from the verification queue — the
same origin as Django admin. The extension is checked AND the file's first
bytes, so a renamed HTML file is refused too.
"""

import os

from rest_framework import serializers

MAX_UPLOAD_BYTES = 15 * 1024 * 1024

# extension -> (content type served back, leading-bytes check)
ALLOWED_UPLOADS = {
    '.pdf': ('application/pdf', lambda head: head.startswith(b'%PDF-')),
    '.jpg': ('image/jpeg', lambda head: head.startswith(b'\xff\xd8\xff')),
    '.jpeg': ('image/jpeg', lambda head: head.startswith(b'\xff\xd8\xff')),
    '.png': ('image/png', lambda head: head.startswith(b'\x89PNG\r\n\x1a\n')),
    '.webp': ('image/webp', lambda head: head[:4] == b'RIFF' and head[8:12] == b'WEBP'),
    # Phone cameras (iPhone especially) save HEIC/HEIF; the "ftyp" box
    # sits at byte 4 with a brand naming the variant.
    '.heic': ('image/heic', lambda head: head[4:8] == b'ftyp' and head[8:12] in {b'heic', b'heix', b'mif1', b'msf1', b'heim', b'heis', b'hevc'}),
    '.heif': ('image/heif', lambda head: head[4:8] == b'ftyp' and head[8:12] in {b'heic', b'heix', b'mif1', b'msf1', b'heim', b'heis', b'hevc'}),
}

ALLOWED_LABEL = 'PDF, JPG, PNG, WebP or HEIC'


def served_content_type(name: str) -> str | None:
    """The Content-Type to serve a stored file with, or None if it is not one we accept."""
    entry = ALLOWED_UPLOADS.get(os.path.splitext(name or '')[1].lower())
    return entry[0] if entry else None


def validate_upload(file):
    """DRF field validator: size, extension and actual file type."""
    if file is None:
        return file
    if file.size and file.size > MAX_UPLOAD_BYTES:
        raise serializers.ValidationError(
            f'This file is too large. The limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.'
        )
    entry = ALLOWED_UPLOADS.get(os.path.splitext(file.name or '')[1].lower())
    if entry is None:
        raise serializers.ValidationError(f'Upload a {ALLOWED_LABEL} file.')
    position = file.tell() if hasattr(file, 'tell') else 0
    try:
        file.seek(0)
        head = file.read(16)
    finally:
        file.seek(position)
    if not entry[1](head):
        raise serializers.ValidationError(
            f"This file doesn't look like a real {os.path.splitext(file.name)[1].lstrip('.').upper()}. "
            f'Upload a {ALLOWED_LABEL} file.'
        )
    return file
