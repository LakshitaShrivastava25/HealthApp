from django.core import signing
from django.core.files.storage import default_storage
from django.http import Http404, HttpResponse
from django.views.decorators.http import require_GET

from .storage import FILE_URL_MAX_AGE, FILE_URL_SALT
from .validators import served_content_type


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

    filename = name.rsplit('/', 1)[-1].replace('"', '')
    content_type = served_content_type(name)
    if content_type:
        # A PDF or photo — the only things uploads accept now
        # (documents/validators.py) — opens in the browser as before.
        response = HttpResponse(data, content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{filename}"'
    else:
        # Anything else, e.g. a file stored before uploads were restricted,
        # is only ever a download. Served inline with a type guessed from
        # its name, an .html or .svg "document" ran as a page on this API's
        # origin; as an opaque, sandboxed attachment it cannot.
        response = HttpResponse(data, content_type='application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Content-Security-Policy'] = "default-src 'none'; sandbox"
    response['Cache-Control'] = 'private, max-age=3600'
    response['X-Content-Type-Options'] = 'nosniff'
    # The signed link is the credential; don't hand it to whatever the file links to.
    response['Referrer-Policy'] = 'no-referrer'
    return response
