"""
GET /api/health/ — used by the CI/CD pipeline and uptime monitors.

Answers 200 only when this process can reach the database, and reports the
commit it is running so a deploy can tell "the new release is live" apart
from "the old release is still answering". Says nothing else: no settings,
no hostnames, no error text.

Commit, first match wins:
  - backend/REVISION, written by the Lightsail deploy script
  - RENDER_GIT_COMMIT, set by Render on every deploy (QA)
"""

import os
from functools import lru_cache

from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@lru_cache(maxsize=1)
def running_commit():
    try:
        value = (settings.BASE_DIR / 'REVISION').read_text(encoding='utf-8').strip()
    except OSError:
        value = ''
    return (value or os.getenv('RENDER_GIT_COMMIT', '') or 'unknown')[:40]


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except Exception:
        return Response({'status': 'error', 'database': 'unreachable', 'commit': running_commit()}, status=503)
    return Response({'status': 'ok', 'database': 'ok', 'commit': running_commit()})
