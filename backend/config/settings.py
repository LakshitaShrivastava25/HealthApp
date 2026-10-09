"""
Django settings for the CuraPath backend.

Database: reads DATABASE_URL from the environment via dj-database-url.
Drops in the Neon PostgreSQL connection string later with zero code
changes — just set DATABASE_URL in .env. Falls back to local SQLite
so the project runs out of the box before that link is provided.
"""

import os
import sys
from datetime import timedelta
from urllib.parse import urlparse
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

TESTING = sys.argv[1:2] == ['test']

# Off unless asked for. It used to default to on, so a server deployed
# without DJANGO_DEBUG ran in debug mode: tracebacks to anyone, /media/
# served publicly, and — with the SMS gateway unset — the login code for any
# number returned in the send-otp response.
DEBUG = os.getenv('DJANGO_DEBUG', 'False') == 'True'

# Signs every JWT and every file link. The old fallback was a string in this
# file, so a deploy missing DJANGO_SECRET_KEY let anyone mint a token for any
# account. Outside DEBUG it is now required (a missing key fails the deploy
# instead of quietly running on a public one).
_PLACEHOLDER_KEYS = {'', 'dev-insecure-secret-key-change-in-production', 'change-this-in-production'}
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', '')
if SECRET_KEY in _PLACEHOLDER_KEYS:
    if not (DEBUG or TESTING):
        raise ImproperlyConfigured('Set DJANGO_SECRET_KEY to a long random value (DJANGO_DEBUG is off).')
    SECRET_KEY = SECRET_KEY or 'dev-insecure-secret-key-change-in-production'

ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',

    'accounts',
    'family',
    'documents',
    'insurance',
    'medicines',
    'emergency',
    'ai',
    'doctors',
    'admin_portal',
    'push',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# --- Database -----------------------------------------------------
# Set DATABASE_URL in .env to switch to Neon PostgreSQL, e.g.:
# DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
DATABASES = {
    'default': dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

AUTH_USER_MODEL = 'accounts.Account'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Uploaded files must survive Render's ephemeral disk — see
# documents/storage.py. Cloudinary in production: set either CLOUDINARY_URL
# (cloudinary://<api_key>:<api_secret>@<cloud_name>, as shown on the
# Cloudinary dashboard) or CLOUDINARY_CLOUD_NAME + _API_KEY + _API_SECRET.
# Without them — and always under `manage.py test`, so the suite never
# uploads to the real account — files go into the database instead.
CLOUDINARY_CLOUD_NAME = os.getenv('CLOUDINARY_CLOUD_NAME', '')
CLOUDINARY_API_KEY = os.getenv('CLOUDINARY_API_KEY', '')
CLOUDINARY_API_SECRET = os.getenv('CLOUDINARY_API_SECRET', '')
if os.getenv('CLOUDINARY_URL') and not CLOUDINARY_CLOUD_NAME:
    _cld = urlparse(os.getenv('CLOUDINARY_URL'))
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET = _cld.hostname, _cld.username, _cld.password
USE_CLOUDINARY = (
    all([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET])
    and sys.argv[1:2] != ['test']
)
STORAGES = {
    'default': {
        'BACKEND': 'documents.storage.CloudinaryStorage' if USE_CLOUDINARY else 'documents.storage.DatabaseStorage',
    },
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

# Render terminates HTTPS at its proxy; without this, absolute file URLs
# built from the request come back as http:// and get blocked as mixed content.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- DRF / JWT ------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    # JSON only in production; the clickable browsable API is a dev aid.
    'DEFAULT_RENDERER_CLASSES': (
        ('rest_framework.renderers.JSONRenderer', 'rest_framework.renderers.BrowsableAPIRenderer')
        if DEBUG else ('rest_framework.renderers.JSONRenderer',)
    ),
    # Global ceilings, plus tighter named budgets for the endpoints that cost
    # money or guard something (config/throttling.py, accounts/views.py).
    # The send-otp per-number limits in accounts/services.py still apply.
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.getenv('THROTTLE_ANON', '600/hour'),
        'user': os.getenv('THROTTLE_USER', '5000/hour'),
        'otp_send': os.getenv('THROTTLE_OTP_SEND', '30/hour'),
        'otp_verify': os.getenv('THROTTLE_OTP_VERIFY', '60/hour'),
        'ai': os.getenv('THROTTLE_AI', '60/hour'),
        'uploads': os.getenv('THROTTLE_UPLOADS', '60/hour'),
        'access_requests': os.getenv('THROTTLE_ACCESS_REQUESTS', '30/hour'),
    } if not TESTING else {
        # The suite makes hundreds of requests from one address; the
        # throttle tests set their own low rates.
        scope: '100000/hour'
        for scope in ('anon', 'user', 'otp_send', 'otp_verify', 'ai', 'uploads', 'access_requests')
    },
}

# Sessions end after 30 days of inactivity: every refresh hands out a new
# 30-day refresh token and blacklists the one it replaced, so a client that
# keeps using the app stays signed in, and a copied old token stops working.
# POST /api/auth/logout/ blacklists the current one. Clients must store the
# rotated token. Run `manage.py flushexpiredtokens` now and then to prune.
SIMPLE_JWT = {
    # Short-lived: a copied access token can't be revoked, so its lifetime is
    # the window. Both apps refresh transparently on a 401.
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('JWT_ACCESS_MINUTES', '60'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

# --- HTTPS (production) ----------------------------------------
# Render terminates TLS and forwards X-Forwarded-Proto, so Django can tell a
# request arrived over HTTPS. Plain-HTTP redirects are left to the platform.
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv('DJANGO_HSTS_SECONDS', '31536000'))

# --- CORS -------------------------------------------------------
# The React User Portal (Vite dev server / Vercel deployment) calls this
# API from a different origin — allow it explicitly rather than '*'.
CORS_ALLOWED_ORIGINS = os.getenv(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:5176,http://127.0.0.1:5176'
).split(',')

# --- Third-party keys (set these in .env — never commit real values) ---
# The Claude API key must live ONLY here on the backend — never in the
# React frontend. See ai/claude_service.py for how it's used.
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
OCR_PROVIDER_API_KEY = os.getenv('OCR_PROVIDER_API_KEY', '')

# 2Factor.in OTP SMS, sent as a DLT transactional SMS (see accounts/services.py).
# Until the API key is set, OTPs are only printed to the server log (and
# returned when DEBUG=True). The Sender ID + template must be mapped under
# Transactional SMS in the 2Factor dashboard; the OTP fills its first variable.
TWOFACTOR_API_KEY = os.getenv('TWOFACTOR_API_KEY', '')
TWOFACTOR_SENDER_ID = os.getenv('TWOFACTOR_SENDER_ID', 'CURAPT')
TWOFACTOR_TEMPLATE_NAME = os.getenv('TWOFACTOR_TEMPLATE_NAME', 'CuraPathOTP')
# Optional DLT ids (PE ID / content template ID) — only needed if 2Factor
# asks for them; leave blank otherwise.
TWOFACTOR_DLT_PE_ID = os.getenv('TWOFACTOR_DLT_PE_ID', '')
TWOFACTOR_DLT_TEMPLATE_ID = os.getenv('TWOFACTOR_DLT_TEMPLATE_ID', '')

# Which gateway sends OTP SMS: true -> 2Factor (above), false -> Twilio Verify
# (below). Master OTP mode overrides both — nothing is sent at all.
USE_TWOFACTOR = os.getenv('USE_TWOFACTOR', 'false').strip().lower() in ('true', '1', 'yes', 'on')

# Twilio Verify OTP (see accounts/services.py). Verify generates, sends and
# checks the code itself, through Twilio's own DLT registration for India.
# Authenticate with EITHER an API key (SK... + secret) OR the account's
# Auth Token; the API key wins when both are set.
TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN', '')
TWILIO_API_KEY_SID = os.getenv('TWILIO_API_KEY_SID', '')
TWILIO_API_KEY_SECRET = os.getenv('TWILIO_API_KEY_SECRET', '')
TWILIO_VERIFY_SERVICE_SID = os.getenv('TWILIO_VERIFY_SERVICE_SID', '')

# Master OTP, controlled from env. USE_MASTER_OTP=true -> nothing is sent and
# every phone logs in with MASTER_OTP. USE_MASTER_OTP=false -> a real SMS goes
# out via the gateway chosen by USE_TWOFACTOR (false = Twilio, true = 2Factor).
# Leave either unset to fall back to the admin-portal / DB OTPConfig value.
_master_flag = os.getenv('USE_MASTER_OTP', '').strip().lower()
USE_MASTER_OTP = (
    None if _master_flag == ''
    else _master_flag in ('true', '1', 'yes', 'on')
)
MASTER_OTP = os.getenv('MASTER_OTP', '').strip()

# Google Play review login. With both set, REVIEWER_PHONE (E.164, e.g.
# +919999999999) gets no SMS and signs in with REVIEWER_OTP; expiry, resend
# cooldown and the attempt limit still apply. Leave either unset to turn it off.
REVIEWER_PHONE = os.getenv('REVIEWER_PHONE', '').strip()
REVIEWER_OTP = os.getenv('REVIEWER_OTP', '').strip()

# Initial OTP mode ('sms' or 'master') used only when the OTPConfig row is
# first created. After that, switch it from the admin portal (Settings → OTP),
# Django admin, or `python manage.py otp_mode master|sms`. Defaults to real SMS;
# set OTP_DEFAULT_MODE=master only for a deploy whose SMS gateway isn't ready.
OTP_DEFAULT_MODE = os.getenv('OTP_DEFAULT_MODE', 'sms')

# Show the OTP flow's INFO logs ("Sending OTP via 2Factor SMS ...") in the
# server console; Python's default root level (WARNING) would hide them.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {'accounts': {'handlers': ['console'], 'level': 'INFO'}},
}
