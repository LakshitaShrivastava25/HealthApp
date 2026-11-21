#!/usr/bin/env bash
# Runs ON the Lightsail server as the deploy user. Called by
# .github/workflows/production.yml; can also be run by hand (see deploy/README.md):
#
#   remote-deploy.sh <commit-sha> <release-bundle.tar.gz>
#
# Order matters — nothing the public sees changes until step 6:
#   1. lock          one deployment at a time
#   2. unpack        into releases/<timestamp>-<sha>, link the shared .env
#   3. venv          fresh virtualenv for this release only
#   4. preflight     Django checks, storage round-trip, collectstatic
#   5. migrate       pg_dump backup first, then migrate (old code still live)
#   6. switch        atomically repoint `current`, restart Gunicorn, nginx -t
#   7. verify        API health reports this commit, site serves this build
#                    -> on failure: repoint to the previous release, restart
#   8. tidy          keep the newest releases / backups, never `current`
#
# Never touches: the production .env (only symlinked), uploaded files
# (object storage / shared/media), Nginx or DNS/SSL configuration.
# Never prints secrets: no `set -x`, credentials go through PG* env vars.

set -Eeuo pipefail
umask 022

SHA="${1:?usage: remote-deploy.sh <commit-sha> <bundle.tar.gz>}"
BUNDLE="${2:?usage: remote-deploy.sh <commit-sha> <bundle.tar.gz>}"

DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/curapath}"
GUNICORN_SERVICE="${GUNICORN_SERVICE:?GUNICORN_SERVICE must be set}"
API_HEALTH_URL="${API_HEALTH_URL:-https://api.curapath.in/api/health/}"
WEB_URL="${WEB_URL:-https://curapath.in/}"
PYTHON="${PYTHON:-python3}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
KEEP_DB_BACKUPS="${KEEP_DB_BACKUPS:-10}"
# BOOTSTRAP=1: first run only — prepare and migrate, point `current` at the
# release, but leave Gunicorn/Nginx alone (they are repointed by hand once).
BOOTSTRAP="${BOOTSTRAP:-0}"

SHARED="$DEPLOY_ROOT/shared"
RELEASES="$DEPLOY_ROOT/releases"
CURRENT="$DEPLOY_ROOT/current"
DB_BACKUPS="$DEPLOY_ROOT/backups/db"
REL_ID="$(date -u +%Y%m%d%H%M%S)-${SHA:0:12}"
REL="$RELEASES/$REL_ID"

STAGE=init
SWITCHED=0
ROLLED_BACK=no
MIGRATIONS=none
PREVIOUS=""

log()  { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { printf '::error::%s\n' "$*"; return 1; }
summary() {
  printf 'DEPLOY_SUMMARY stage=%s\n' "$STAGE"
  printf 'DEPLOY_SUMMARY rolled_back=%s\n' "$ROLLED_BACK"
  printf 'DEPLOY_SUMMARY release=%s\n' "$REL_ID"
  printf 'DEPLOY_SUMMARY migrations=%s\n' "$MIGRATIONS"
}

switch_to() {  # atomic: rename(2) of a symlink over the old one
  ln -sfn "$1" "$DEPLOY_ROOT/.current.next"
  mv -Tf "$DEPLOY_ROOT/.current.next" "$CURRENT"
}

rollback() {
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    log "Rolling back to $(basename "$PREVIOUS")"
    switch_to "$PREVIOUS"
    sudo -n systemctl restart "$GUNICORN_SERVICE" || true
    ROLLED_BACK=yes
  else
    log "No previous release to roll back to."
    ROLLED_BACK=impossible
  fi
}

on_error() {
  local code=$?
  trap - ERR
  printf '::error::Deployment failed during stage: %s (exit %s)\n' "$STAGE" "$code"
  if [ "$SWITCHED" = 1 ]; then
    rollback
  else
    log "The live site was not changed."
  fi
  summary
  exit "$code"
}
trap on_error ERR

M() { (cd "$REL/backend" && "$REL/venv/bin/python" manage.py "$@"); }

# Answers 0 once the API reports this commit and a healthy database.
api_serves() {
  local want="$1" body
  for _ in $(seq 1 30); do
    body="$(curl -fsS --max-time 10 "$API_HEALTH_URL" 2>/dev/null || true)"
    case "$body" in
      *'"status":"ok"'*'"commit":"'"$want"'"'*) return 0 ;;
    esac
    sleep 3
  done
  log "Last health response: ${body:-<none>}"
  return 1
}

# Answers 0 when the public site serves exactly this release's index.html.
web_serves() {
  local want got
  want="$(sha256sum < "$1/frontend/index.html" | cut -d' ' -f1)"
  for _ in $(seq 1 10); do
    got="$(curl -fsS --max-time 10 "$WEB_URL" 2>/dev/null | sha256sum | cut -d' ' -f1)"
    [ "$got" = "$want" ] && return 0
    sleep 3
  done
  return 1
}

# ---------------------------------------------------------------- 1. lock
STAGE=lock
mkdir -p "$RELEASES" "$DB_BACKUPS" "$DEPLOY_ROOT/bin"
exec 9>"$DEPLOY_ROOT/deploy.lock"
flock -w 900 9 || fail "Another deployment held the lock for 15 minutes."
log "Deploying $SHA as $REL_ID"

[ -f "$SHARED/backend.env" ] || fail "Missing $SHARED/backend.env (see deploy/README.md)."
for key in DJANGO_SECRET_KEY DATABASE_URL MPIN_PEPPER DJANGO_ALLOWED_HOSTS; do
  grep -qE "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=[[:space:]]*[^[:space:]]" "$SHARED/backend.env" \
    || fail "$key is missing or empty in $SHARED/backend.env (values are never printed)."
done
if [ -L "$CURRENT" ]; then PREVIOUS="$(readlink -f "$CURRENT")"; fi
if [ "$BOOTSTRAP" = 1 ] && [ -n "$PREVIOUS" ]; then
  fail "BOOTSTRAP is only for the first run and $CURRENT already exists. Delete the PROD_DEPLOY_BOOTSTRAP variable."
fi

# -------------------------------------------------------------- 2. unpack
STAGE=unpack
mkdir "$REL"
tar -xzf "$BUNDLE" -C "$REL"
[ -f "$REL/frontend/index.html" ] || fail "Bundle has no frontend/index.html."
[ "$(cat "$REL/backend/REVISION")" = "$SHA" ] || fail "Bundle REVISION does not match $SHA."
ln -sfn "$SHARED/backend.env" "$REL/backend/.env"
# Only if this server ever kept files on local disk: share them, never copy.
if [ -d "$SHARED/media" ] && [ ! -e "$REL/backend/media" ]; then
  ln -s "$SHARED/media" "$REL/backend/media"
fi
install -m 755 "$REL/deploy/rollback.sh" "$DEPLOY_ROOT/bin/rollback.sh"
install -m 755 "$REL/deploy/remote-deploy.sh" "$DEPLOY_ROOT/bin/remote-deploy.sh"

# ---------------------------------------------------------------- 3. venv
STAGE=dependencies
"$PYTHON" -m venv "$REL/venv"
"$REL/venv/bin/pip" install --quiet --disable-pip-version-check --upgrade pip
"$REL/venv/bin/pip" install --quiet --disable-pip-version-check -r "$REL/backend/requirements.txt"

# ----------------------------------------------------------- 4. preflight
STAGE=preflight
M check --deploy --fail-level ERROR
# Uploads must go to object storage. DatabaseStorage here means the storage
# configuration did not load — refuse rather than quietly store files in the DB.
M shell -c "
import sys
from django.conf import settings
backend = settings.STORAGES['default']['BACKEND']
print('Storage backend:', backend.rsplit('.', 1)[-1])
sys.exit(3 if backend.endswith('DatabaseStorage') else 0)
" || fail "Production storage is not configured for this release (would fall back to the database)."
M check_file_storage
M collectstatic --noinput > /dev/null

# ------------------------------------------------------------- 5. migrate
STAGE=migrate
PLAN="$(M migrate --plan)"
if printf '%s\n' "$PLAN" | grep -q 'No planned migration operations'; then
  log "No pending migrations."
else
  MIGRATIONS="$(printf '%s\n' "$PLAN" | grep -E '^[[:space:]]*[a-z_0-9]+\.[0-9]{4}_' | sed -E 's/^[[:space:]]+//' | paste -sd ',' -)"
  log "Pending migrations: ${MIGRATIONS:-see plan below}"
  printf '%s\n' "$PLAN"
  if printf '%s\n' "$PLAN" | grep -qiE 'Remove field|Delete model|Rename (field|model)|Raw SQL|Alter unique_together|Remove constraint'; then
    printf '::warning::These migrations remove or rename database objects. A code rollback cannot undo them; the pre-migration backup can.\n'
    MIGRATIONS="$MIGRATIONS (WARNING: removes/renames data)"
  fi

  STAGE=backup
  # Credentials go to pg_dump via PG* variables, never argv or the log.
  eval "$(cd "$REL/backend" && "$REL/venv/bin/python" - <<'PY'
import shlex
from urllib.parse import parse_qs, unquote, urlsplit
from dotenv import dotenv_values
url = urlsplit(dotenv_values('.env').get('DATABASE_URL') or '')
query = parse_qs(url.query)
pairs = {
    'PGHOST': url.hostname or '',
    'PGPORT': str(url.port or 5432),
    'PGUSER': unquote(url.username or ''),
    'PGPASSWORD': unquote(url.password or ''),
    'PGDATABASE': url.path.lstrip('/'),
    'PGSSLMODE': (query.get('sslmode') or ['require'])[0],
}
print('\n'.join(f'export {k}={shlex.quote(v)}' for k, v in pairs.items()))
PY
)"
  DUMP="$DB_BACKUPS/$REL_ID.dump"
  (umask 077 && pg_dump --format=custom --no-owner --no-privileges --file="$DUMP")
  unset PGPASSWORD
  log "Database backed up to $DUMP ($(du -h "$DUMP" | cut -f1))"

  STAGE=migrate
  M migrate --noinput
fi

# -------------------------------------------------------------- 6. switch
STAGE=switch
switch_to "$REL"
if [ "$BOOTSTRAP" = 1 ]; then
  log "BOOTSTRAP: $CURRENT -> $REL_ID. Gunicorn and Nginx were not touched;"
  log "repoint them at $CURRENT as described in deploy/README.md."
  STAGE=done
  summary
  exit 0
fi
SWITCHED=1
sudo -n systemctl restart "$GUNICORN_SERVICE"
sudo -n nginx -t

# -------------------------------------------------------------- 7. verify
STAGE=verify-api
api_serves "$SHA" || fail "API at $API_HEALTH_URL did not report commit $SHA with a healthy database."
STAGE=verify-web
web_serves "$REL" || fail "$WEB_URL is not serving this release's index.html."
log "Live: API reports $SHA, website serves this build."
rm -f "$BUNDLE" "$(dirname "$BUNDLE")/remote-deploy-$SHA.sh"

# ---------------------------------------------------------------- 8. tidy
STAGE=tidy
LIVE="$(readlink -f "$CURRENT")"
find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
    -regex '.*/[0-9]{14}-[0-9a-f]{12}' -printf '%f\n' | sort -r | tail -n +"$((KEEP_RELEASES + 1))" |
  while read -r old; do
    case "$RELEASES/$old" in "$LIVE"|"$PREVIOUS") continue ;; esac
    rm -rf -- "${RELEASES:?}/$old"
  done
find "$DB_BACKUPS" -maxdepth 1 -type f -name '*.dump' -printf '%f\n' | sort -r |
  tail -n +"$((KEEP_DB_BACKUPS + 1))" | while read -r old; do rm -f -- "${DB_BACKUPS:?}/$old"; done

STAGE=done
summary
