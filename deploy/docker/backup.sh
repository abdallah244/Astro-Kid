#!/bin/sh
# Nightly PostgreSQL backup with 30-day retention (Account Deletion Policy, section 5).
# Runs inside the "backup" container; dumps land in the ./backups folder on the VPS.
set -eu
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_HOUR="${BACKUP_HOUR:-3}"

backup_once() {
  stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  out="/backups/astrokid-${stamp}.sql.gz"
  pg_dump --no-owner --no-privileges | gzip -9 > "${out}.tmp" && mv "${out}.tmp" "${out}"
  find /backups -name 'astrokid-*.sql.gz' -type f -mtime +"${RETENTION_DAYS}" -delete
  echo "backup written: ${out}"
}

backup_once
while true; do
  now_h=$(date -u +%H | sed 's/^0//'); now_m=$(date -u +%M | sed 's/^0//')
  wait=$(( ((BACKUP_HOUR - ${now_h:-0} + 24) % 24) * 3600 - ${now_m:-0} * 60 ))
  [ "$wait" -le 0 ] && wait=$(( wait + 86400 ))
  sleep "$wait"
  backup_once || echo "backup failed, will retry tomorrow" >&2
done
