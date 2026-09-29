"""
Sending push notifications through Expo's push service.

https://docs.expo.dev/push-notifications/sending-notifications/

Sends happen on a background thread after the database transaction
commits, so a slow or unreachable push service never delays the API
response that triggered it, and a rolled-back change never notifies.
"""

import json
import logging
import threading
import urllib.error
import urllib.request

from django.db import transaction

from .models import PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
EXPO_BATCH_SIZE = 100  # Expo's per-request limit
TIMEOUT_SECONDS = 10


def notify_account(account, title, body, data=None):
    """Queue a push to every active device of one account."""
    if account is None:
        return
    account_id = account.pk
    transaction.on_commit(
        lambda: threading.Thread(
            target=_send_to_account,
            args=(account_id, title, body, data or {}),
            daemon=True,
        ).start()
    )


def _send_to_account(account_id, title, body, data):
    tokens = list(
        PushDevice.objects.filter(account_id=account_id, is_active=True).values_list('token', flat=True)
    )
    if not tokens:
        return
    messages = [
        {
            'to': token,
            'title': title,
            'body': body,
            'data': data,
            'sound': 'default',
            'priority': 'high',
            'channelId': 'default',
        }
        for token in tokens
    ]
    for start in range(0, len(messages), EXPO_BATCH_SIZE):
        _post_batch(messages[start:start + EXPO_BATCH_SIZE])


def _post_batch(messages):
    request = urllib.request.Request(
        EXPO_PUSH_URL,
        data=json.dumps(messages).encode(),
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as resp:
            payload = json.loads(resp.read().decode() or '{}')
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.warning('Expo push send failed: %s', exc)
        return

    # Tickets come back in the same order as the messages. A token Expo
    # reports as DeviceNotRegistered (app uninstalled, permission revoked)
    # is retired so it stops being retried on every event.
    dead = []
    for message, ticket in zip(messages, payload.get('data') or []):
        if ticket.get('status') == 'error':
            reason = (ticket.get('details') or {}).get('error')
            logger.warning('Expo push ticket error (%s): %s', reason, ticket.get('message'))
            if reason == 'DeviceNotRegistered':
                dead.append(message['to'])
    if dead:
        PushDevice.objects.filter(token__in=dead).update(is_active=False)
