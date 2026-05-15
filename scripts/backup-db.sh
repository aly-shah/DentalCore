#!/usr/bin/env bash
# DentaCore — daily backup script.
#
# Backs up:
#   1. The PostgreSQL database (pg_dump → .sql.gz)
#   2. The Baileys WhatsApp session directory (tar.gz) — without this
#      the QR code must be re-scanned after a restore.
#
# Usage: ./scripts/backup-db.sh
#   Reads DATABASE_URL from env. Writes to ./backups/ (or $BACKUP_DIR).
#   Old backups beyond $BACKUP_RETENTION_DAYS (default 14) are pruned.
#
# Cron example (daily at 02:30):
#   30 2 * * * cd /opt/dentacore && /usr/bin/env bash scripts/backup-db.sh >> /var/log/dentacore-backup.log 2>&1

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Pull DATABASE_URL from .env if not already in the environment.
if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source .env
  set +o allexport
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup-db] ERROR: DATABASE_URL not set" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
SESSION_FILE="$BACKUP_DIR/wa_session_${TIMESTAMP}.tar.gz"

echo "[backup-db] Starting backup at $TIMESTAMP"

# ── 1. Postgres dump
echo "[backup-db] Dumping database to $DB_FILE"
if ! pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip > "$DB_FILE"; then
  echo "[backup-db] ERROR: pg_dump failed" >&2
  rm -f "$DB_FILE"
  exit 2
fi
DB_SIZE="$(du -h "$DB_FILE" | cut -f1)"
echo "[backup-db] DB backup: $DB_SIZE"

# ── 2. Baileys session (only if the directory exists)
SESSION_DIR="${PROJECT_ROOT}/.whatsapp-session"
if [[ -d "$SESSION_DIR" ]]; then
  echo "[backup-db] Archiving Baileys session"
  tar -czf "$SESSION_FILE" -C "$PROJECT_ROOT" .whatsapp-session
  SESS_SIZE="$(du -h "$SESSION_FILE" | cut -f1)"
  echo "[backup-db] WA session backup: $SESS_SIZE"
else
  echo "[backup-db] No .whatsapp-session — skipping"
fi

# ── 3. Prune older backups
echo "[backup-db] Pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "db_*.sql.gz" -o -name "wa_session_*.tar.gz" \) \
  -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "[backup-db] Done."
