"""The one HTTP call the outside verification providers make: POST JSON, read JSON back."""

import json
import urllib.error
import urllib.request

from .base import ProviderUnavailable

USER_AGENT = 'CuraPath-DoctorVerification/1.0 (+https://curapath.in)'


def post_json(url: str, body: dict, headers: dict, timeout: float):
    """
    (HTTP status, parsed JSON body or None). An error status still comes
    back with its body — Decentro answers "no record" as a 404 with JSON.
    Only a request that got no answer at all raises ProviderUnavailable.
    """
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': USER_AGENT, **headers},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status, text = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, text = exc.code, exc.read()
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        reason = getattr(exc, 'reason', exc)
        raise ProviderUnavailable(f'{type(reason).__name__}: {reason}') from exc
    try:
        return status, json.loads(text.decode('utf-8'))
    except ValueError:
        return status, None
