#!/usr/bin/env bash
# Point production back at an earlier release and restart Gunicorn.
# Installed on the server as $DEPLOY_ROOT/bin/rollback.sh by every deploy.
#
#   rollback.sh                  # the release before the live one
#   rollback.sh <release-id>     # a specific one (ls $DEPLOY_ROOT/releases)
#   rollback.sh --list           # show releases, marking the live one
#
# Code only. The database is NOT rolled back: migrations are additive in
# normal releases, so older code keeps working against the newer schema.
# To undo a destructive migration, restore its pre-migration backup from
# $DEPLOY_ROOT/backups/db (see deploy/README.md) — a deliberate manual step.

set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/curapath}"
GUNICORN_SERVICE="${GUNICORN_SERVICE:?GUNICORN_SERVICE must be set}"
API_HEALTH_URL="${API_HEALTH_URL:-https://api.curapath.in/api/health/}"
RELEASES="$DEPLOY_ROOT/releases"
CURRENT="$DEPLOY_ROOT/current"

log() { printf '[rollback %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { printf '::error::%s\n' "$*"; exit 1; }

LIVE="$(readlink -f "$CURRENT" 2>/dev/null || true)"
mapfile -t ALL < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)

if [ "${1:-}" = "--list" ]; then
  for r in "${ALL[@]}"; do
    rev="$(cat "$RELEASES/$r/backend/REVISION" 2>/dev/null || echo '?')"
    mark=' '; [ "$RELEASES/$r" = "$LIVE" ] && mark='*'
    printf '%s %s  %s\n' "$mark" "$r" "$rev"
  done
  exit 0
fi

exec 9>"$DEPLOY_ROOT/deploy.lock"
flock -w 900 9 || die "A deployment held the lock for 15 minutes."

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  for r in "${ALL[@]}"; do
    [ "$RELEASES/$r" = "$LIVE" ] && break
    TARGET="$r"
  done
  [ -n "$TARGET" ] || die "There is no release older than the live one."
fi
case "$TARGET" in */*|.*) die "Invalid release id: $TARGET" ;; esac
[ -d "$RELEASES/$TARGET" ] || die "No such release: $TARGET (try --list)."
[ "$RELEASES/$TARGET" != "$LIVE" ] || die "$TARGET is already live."
[ -x "$RELEASES/$TARGET/venv/bin/python" ] || die "$TARGET has no virtualenv; it was never fully prepared."

WANT="$(cat "$RELEASES/$TARGET/backend/REVISION")"
log "Live: $(basename "${LIVE:-none}")  ->  rolling back to: $TARGET ($WANT)"

ln -sfn "$RELEASES/$TARGET" "$DEPLOY_ROOT/.current.next"
mv -Tf "$DEPLOY_ROOT/.current.next" "$CURRENT"
sudo -n systemctl restart "$GUNICORN_SERVICE"
sudo -n nginx -t

for _ in $(seq 1 30); do
  body="$(curl -fsS --max-time 10 "$API_HEALTH_URL" 2>/dev/null || true)"
  case "$body" in
    *'"status":"ok"'*'"commit":"'"$WANT"'"'*)
      log "Rolled back. API reports $WANT and a healthy database."
      printf 'DEPLOY_SUMMARY stage=done\nDEPLOY_SUMMARY release=%s\n' "$TARGET"
      exit 0 ;;
  esac
  sleep 3
done
die "Switched to $TARGET, but the API did not report $WANT as healthy. Last response: ${body:-<none>}"
