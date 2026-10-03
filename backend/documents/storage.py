"""
Persistent file storage for every FileField in the project (documents,
insurance policies, doctor licences).

Render's disk is ephemeral: anything written to MEDIA_ROOT disappears on
every deploy, restart and free-tier spin-down, and with DEBUG off nothing
serves /media/ anyway — so an upload "succeeded" but the file could never
be opened again.

Production stores files in Cloudinary (CloudinaryStorage), uploaded as
type='authenticated' so Cloudinary hands them to no one without a request
signed with the API secret. Without Cloudinary keys (local dev, tests) the
bytes go in the database instead (DatabaseStorage), which also survives
restarts.

Either way, medical files must not be readable by anyone who guesses a URL,
but the apps open them with a plain link (browser tab / Linking.openURL)
that can't carry the JWT header. So url() hands out a link to our own
/api/files/ endpoint, signed with SECRET_KEY and expiring after
FILE_URL_MAX_AGE; documents/files.py checks the signature and streams the
file back.
"""

import mimetypes
import os
import secrets
import time
import urllib.error
import urllib.request

from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.urls import reverse
from django.utils.deconstruct import deconstructible

FILE_URL_SALT = 'documents.stored-file'
# Long enough that a list fetched a while ago still opens, short enough
# that a link copied out of the app stops working the same day.
FILE_URL_MAX_AGE = 6 * 60 * 60


def _read_bytes(content):
    if hasattr(content, 'seek'):
        content.seek(0)
    data = content.read()
    return data.encode() if isinstance(data, str) else data


class SignedUrlMixin:
    def url(self, name):
        token = signing.TimestampSigner(salt=FILE_URL_SALT).sign(name)
        return f"{reverse('stored-file')}?t={token}"


@deconstructible
class DatabaseStorage(SignedUrlMixin, Storage):
    def _model(self):
        # Imported lazily: settings builds this storage before apps load.
        from .models import StoredFile
        return StoredFile

    def _open(self, name, mode='rb'):
        obj = self._model().objects.filter(name=name).first()
        if obj is None:
            raise FileNotFoundError(name)
        return ContentFile(bytes(obj.content), name=name)

    def _save(self, name, content):
        data = _read_bytes(content)
        content_type = (
            getattr(content, 'content_type', None)
            or mimetypes.guess_type(name)[0]
            or 'application/octet-stream'
        )
        self._model().objects.create(name=name, content=data, content_type=content_type, size=len(data))
        return name

    def exists(self, name):
        return self._model().objects.filter(name=name).exists()

    def delete(self, name):
        self._model().objects.filter(name=name).delete()

    def size(self, name):
        obj = self._model().objects.filter(name=name).only('size').first()
        if obj is None:
            raise FileNotFoundError(name)
        return obj.size


@deconstructible
class CloudinaryStorage(SignedUrlMixin, Storage):
    """
    resource_type='raw' stores the file byte-for-byte: a PDF is never
    transformed, and isn't caught by Cloudinary's "PDF delivery disabled"
    default for image assets. type='authenticated' keeps it private.
    """

    RESOURCE_TYPE = 'raw'
    DELIVERY_TYPE = 'authenticated'
    # Lifetime of the server-side download link _open() fetches from.
    DOWNLOAD_LINK_SECONDS = 300

    def _configure(self):
        import cloudinary
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )

    def _options(self):
        return {'resource_type': self.RESOURCE_TYPE, 'type': self.DELIVERY_TYPE}

    def get_available_name(self, name, max_length=None):
        # Always add a random suffix instead of asking Cloudinary whether the
        # name is taken: exists() costs a rate-limited Admin API call, and two
        # uploads named "report.pdf" in one month are routine.
        root, ext = os.path.splitext(name)
        suffix = f'_{secrets.token_hex(4)}{ext}'
        if max_length is not None and len(root) + len(suffix) > max_length:
            root = root[:max_length - len(suffix)]
        return root + suffix

    def _save(self, name, content):
        self._configure()
        import cloudinary.uploader
        result = cloudinary.uploader.upload(
            _read_bytes(content), public_id=name, overwrite=False, **self._options()
        )
        return result.get('public_id', name)

    def _open(self, name, mode='rb'):
        self._configure()
        import cloudinary.utils
        # Raw assets keep their extension in public_id, so format stays empty.
        url = cloudinary.utils.private_download_url(
            name, '', expires_at=int(time.time()) + self.DOWNLOAD_LINK_SECONDS, **self._options()
        )
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                data = resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise FileNotFoundError(name) from exc
            raise
        return ContentFile(data, name=name)

    def _resource(self, name):
        self._configure()
        import cloudinary.api
        import cloudinary.exceptions
        try:
            return cloudinary.api.resource(name, **self._options())
        except cloudinary.exceptions.NotFound:
            return None

    def exists(self, name):
        return self._resource(name) is not None

    def size(self, name):
        resource = self._resource(name)
        if resource is None:
            raise FileNotFoundError(name)
        return resource.get('bytes', 0)

    def delete(self, name):
        self._configure()
        import cloudinary.uploader
        cloudinary.uploader.destroy(name, invalidate=True, **self._options())
