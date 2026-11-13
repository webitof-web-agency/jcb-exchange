#!/usr/bin/env bash
# Backup restore drill: proves a backup file can actually be restored. Run monthly, and after any change to
# the backup job. It restores into a NEW temporary database, prints row counts of the key tables, and drops
# the temporary database again. It never touches the live database.
#
#   deploy/restore-drill.sh /var/backups/jcbexchange/pre-deploy-....dump
#   deploy/restore-drill.sh ~/Downloads/db_dump_2026-11-12_020000.dump      # a Google Drive backup
#
# Connection for the temporary database (a role allowed to CREATE DATABASE), default: local postgres user:
#   DRILL_PG_URL=postgresql://postgres@127.0.0.1:5432/postgres
set -euo pipefail

DUMP="${1:?Usage: deploy/restore-drill.sh <backup.dump>}"
[ -s "$DUMP" ] || { echo "Backup file not found or empty: $DUMP" >&2; exit 1; }
ADMIN_URL="${DRILL_PG_URL:-postgresql://postgres@127.0.0.1:5432/postgres}"
DRILL_DB="restore_drill_$(date +%Y%m%d%H%M%S)"
DRILL_URL="${ADMIN_URL%/*}/$DRILL_DB"

cleanup() { psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS \"$DRILL_DB\" WITH (FORCE)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Checking archive"
pg_restore --list "$DUMP" >/dev/null
echo "==> Creating $DRILL_DB"
psql "$ADMIN_URL" -qc "CREATE DATABASE \"$DRILL_DB\""
echo "==> Restoring (this can take a few minutes)"
START=$(date +%s)
pg_restore --no-owner --no-acl --exit-on-error --dbname="$DRILL_URL" "$DUMP"
echo "    restored in $(( $(date +%s) - START ))s"

echo "==> Row counts"
psql "$DRILL_URL" -At -F $'\t' <<'SQL'
SELECT 'users', count(*) FROM "User"
UNION ALL SELECT 'listings', count(*) FROM "Listing"
UNION ALL SELECT 'leads', count(*) FROM "Lead"
UNION ALL SELECT 'sell accounts', count(*) FROM "SellAccount"
UNION ALL SELECT 'finance vouchers', count(*) FROM "FinVoucher"
UNION ALL SELECT 'applied migrations', count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
SQL

USERS=$(psql "$DRILL_URL" -Atc 'SELECT count(*) FROM "User"')
ADMINS=$(psql "$DRILL_URL" -Atc "SELECT count(*) FROM \"User\" WHERE role = 'SUPER_ADMIN'")
if [ "$USERS" -lt 1 ] || [ "$ADMINS" -lt 1 ]; then
  echo "FAILED: the restored database has no users or no super admin." >&2
  exit 1
fi
echo "==> Restore drill passed ($USERS users, $ADMINS super admin). Temporary database will be dropped."
