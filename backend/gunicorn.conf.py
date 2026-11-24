"""
Gunicorn settings for production. Gunicorn loads ./gunicorn.conf.py from its
working directory on its own, and the curapath.service unit runs it from
/srv/curapath/current/backend — so these ship with every deploy and take
effect on the deploy's restart. Flags on the unit's command line (it passes
--workers and --bind) take precedence over this file.

See deploy/curapath.service for the reasoning behind each value.
"""

# Threads, not sync workers. A sync worker handles one request at a time, so
# with two of them, two requests waiting on something slow (an AI answer, the
# NMC register, an SMS gateway, a large file from storage) stalled the API for
# everyone. Each thread here waits on its own; Django is thread-safe, and
# network waits and hashlib's PBKDF2 release the GIL.
worker_class = 'gthread'
threads = 8

# Sized for the 2 vCPU / 1 GB Lightsail instance (~90 MB per worker). The
# unit's --workers flag overrides this.
workers = 2

# Sync workers killed any request running past 30 s (the default) — a slow AI
# call became a 502. For gthread this is a worker heartbeat, not a per-request
# limit; the apps set their own request timeouts.
timeout = 120
graceful_timeout = 30

# No max_requests: recycling a worker would kill the background threads that
# read uploaded documents and insurance policies part-way through.

# One line per request, with how long it took — `journalctl -u curapath`
# shows slow endpoints in production. Find anything over a second with:
#   sudo journalctl -u curapath | grep -E '\|[0-9]{4,}ms$'
# Pipe-separated with no spaces in the format itself, so the same format can
# be passed on the unit's command line without any quoting.
accesslog = '-'
access_log_format = '%(h)s|%(r)s|%(s)s|%(b)s|%(M)sms'


def post_worker_init(worker):
    """
    Load every URL route — and with it every view module and the libraries
    they pull in (DRF, the AI SDK, PIL, pypdf, boto3) — while the worker
    boots, not on the first request it serves. Measured in production on
    2026-11-24: each worker's first request took ~790 ms, every later one
    ~1 ms.

    The database connection is deliberately not opened here: Django's
    connections are per thread, so one opened on this thread would never be
    used by the request threads and would only sit idle.
    """
    try:
        from django.urls import get_resolver

        get_resolver().url_patterns
    except Exception:  # a failed warm-up must never stop the worker serving
        worker.log.exception('Warm-up of URL routes failed')
