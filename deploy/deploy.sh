#!/usr/bin/env bash
# Deploys the checked-out repository on the server it runs on (production or staging).
#
#   deploy/deploy.sh [git-ref]        # default: origin/main
#   deploy/deploy.sh --rollback       # go back to the commit before the last deploy (code only)
#
# Steps: fetch → fast-forward to the ref → install + build all three apps → back up the database →
# prisma migrate deploy → pm2 reload → health check. Any failing step stops the deploy before pm2 reload,
# so the running apps keep serving the old build until a new one is ready.
#
# Server-side settings (environment or deploy/.deploy.env, git-ignored):
#   PM2_PREFIX=jcb  API_PORT=5002  WEB_PORT=3000  PORTAL_PORT=3001
#   BACKUP_DIR=/var/backups/jcbexchange   BACKUP_KEEP=14   SKIP_DB_BACKUP=0
#   HEALTH_URL=http://127.0.0.1:5002/health/ready
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -f deploy/.deploy.env ] && set -a && . deploy/.deploy.env && set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/jcbexchange}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${API_PORT:-5002}/health/ready}"
STATE_FILE="$ROOT/deploy/.last-deploy"

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "The server checkout has local changes to tracked files. Commit or discard them before deploying:" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

PREVIOUS_SHA="$(git rev-parse HEAD)"
if [ "${1:-}" = "--rollback" ]; then
  [ -f "$STATE_FILE" ] || { echo "No previous deploy recorded." >&2; exit 1; }
  TARGET="$(cut -d' ' -f1 "$STATE_FILE")"
  log "Rolling back code to $TARGET (database migrations are not reverted)"
  git checkout --detach "$TARGET"
else
  REF="${1:-origin/main}"
  log "Fetching $REF"
  git fetch --prune origin
  TARGET="$(git rev-parse "$REF")"
  git checkout --detach "$TARGET"
fi

log "Backend: install + build"
(cd backend && npm ci --no-audit --no-fund && npm run build)
log "Website: install + build"
(cd frontend && npm ci --no-audit --no-fund && npm run build)
log "Portal: install + build"
(cd admin-portal && npm ci --no-audit --no-fund && npm run build)

if [ "${SKIP_DB_BACKUP:-0}" != "1" ]; then
  log "Database backup before migrations"
  mkdir -p "$BACKUP_DIR"
  DB_URL="$(cd backend && node -e "require('dotenv').config({quiet:true});process.stdout.write((process.env.DATABASE_URL||'').replace(/^['\"]|['\"]$/g,''))")"
  [ -n "$DB_URL" ] || { echo "DATABASE_URL is not set in backend/.env" >&2; exit 1; }
  # pg_dump does not understand Prisma's ?schema= parameter.
  DUMP="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S)-${TARGET:0:8}.dump"
  pg_dump --format=custom --no-owner --file="$DUMP" "${DB_URL%%\?*}"
  echo "Saved $DUMP ($(du -h "$DUMP" | cut -f1))"
  ls -1t "$BACKUP_DIR"/pre-deploy-*.dump 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f
fi

log "Database migrations"
(cd backend && npx prisma migrate deploy)

log "Reloading apps"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save >/dev/null

log "Health check: $HEALTH_URL"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null; then
    echo "$PREVIOUS_SHA $(date -Is)" > "$STATE_FILE"
    log "Deployed $(git log -1 --format='%h %s' "$TARGET")"
    exit 0
  fi
  sleep 2
done
echo "API did not become healthy. Check: pm2 logs ${PM2_PREFIX:-jcb}-api --lines 100" >&2
echo "Roll back code with: deploy/deploy.sh --rollback" >&2
echo "$PREVIOUS_SHA $(date -Is)" > "$STATE_FILE"
exit 1
