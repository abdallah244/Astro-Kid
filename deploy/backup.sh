#!/usr/bin/env bash
# Nightly PostgreSQL backup with 30-day retention (matches Part Three: Account Deletion Policy).
set -euo pipefail

BACKUP_DIR="/var/backups/astro-kid"
DB_NAME="astrokid"
RETENTION_DAYS=30
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/astrokid-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

pg_dump "${DB_NAME}" | gzip -9 > "${OUT_FILE}"
chmod 600 "${OUT_FILE}"

# Remove dumps older than 30 days so deleted accounts do not persist beyond 30 days
find "${BACKUP_DIR}" -type f -name 'astrokid-*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete
