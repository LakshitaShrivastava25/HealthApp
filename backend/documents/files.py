import mimetypes

from django.core import signing
from django.core.files.storage import default_storage
from django.http import Http404, HttpResponse
from django.views.decorators.http import require_GET

from .storage import FILE_URL_MAX_AGE, FILE_URL_SALT


@require_GET
def serve_stored_file(request):
    """
    GET /api/files/?t=<signed name> — the link the storage's url() hands
    out. The signature is the permission check: it was only ever issued by
    an API response the caller was already authorised to see.
    """
    try:
        name = signing.TimestampSigner(salt=FILE_URL_SALT).unsign(
            request.GET.get('t', ''), max_age=FILE_URL_MAX_AGE
        )
    except signing.BadSignature:  # also covers SignatureExpired
        raise Http404('This file link is invalid or has expired.')

    try:
        with default_storage.open(name) as fh:
            data = fh.read()
    except FileNotFoundError:
        raise Http404('File not found.')

    content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    response = HttpResponse(data, content_type=content_type)
    filename = name.rsplit('/', 1)[-1].replace('"', '')
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    response['Cache-Control'] = 'private, max-age=3600'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
