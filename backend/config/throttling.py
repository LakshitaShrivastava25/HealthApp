"""
Per-action rate limits on top of the global anon/user ones in settings.py.

The expensive or abusable actions get a tighter, named budget: anything that
calls the paid AI model, file uploads (each one is parsed and sent to the
model), and doctors' access requests (each one probes a patient reference
code). Rates live in REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'].

The default cache backs the counters. With one cache per process (Django's
default LocMemCache) every worker counts on its own, so the effective limit
is the rate times the number of workers — a shared cache (Redis, or Django's
database cache) makes it exact.
"""

from rest_framework.throttling import ScopedRateThrottle


class ActionThrottleMixin:
    """Applies `action_throttle_scopes[action]` to writes of that action."""

    action_throttle_scopes: dict[str, str] = {}

    def get_throttles(self):
        throttles = super().get_throttles()
        scope = self.action_throttle_scopes.get(getattr(self, 'action', None))
        # Reads (e.g. GET on the insurance chat, which only returns history)
        # cost nothing and are not limited beyond the global rate.
        if scope and self.request.method not in ('GET', 'HEAD', 'OPTIONS'):
            self.throttle_scope = scope
            throttles.append(ScopedRateThrottle())
        return throttles
