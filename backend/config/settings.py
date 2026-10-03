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
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'dev-insecure-secret-key-change-in-production')
DEBUG = os.getenv('DJANGO_DEBUG', 'True') == 'True'
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
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
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
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
}

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

# Initial OTP mode ('sms' or 'master') used only when the OTPConfig row is
# first created. After that, switch it from the admin portal (Settings → OTP),
# Django admin, or `python manage.py otp_mode master|sms`.
OTP_DEFAULT_MODE = os.getenv('OTP_DEFAULT_MODE', 'master')

# Show the OTP flow's INFO logs ("Sending OTP via 2Factor SMS ...") in the
# server console; Python's default root level (WARNING) would hide them.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {'accounts': {'handlers': ['console'], 'level': 'INFO'}},
}
