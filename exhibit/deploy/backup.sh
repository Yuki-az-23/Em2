#!/usr/bin/env bash
# =============================================================================
# Nightly backup of the exhibit test database and storage files.
# Installed by bootstrap-vm.sh as /usr/local/sbin/exhibit-test-backup and run
# by exhibit-test-backup.timer. Run by hand: sudo /usr/local/sbin/exhibit-test-backup
#
# Writes /opt/exhibit-test/backups/db-<ts>.dump (pg_dump -Fc) and
# storage-<ts>.tgz, checks the dump with pg_restore --list, deletes files older
# than 14 days, and records "ok <ts>" or "fail <ts> <step>" in
# /var/lib/exhibit-test/backup.status. Prints no secrets.
#
# Restore (application schema only; see the runbook):
#   docker exec -i supabase-db pg_restore -U supabase_admin -d postgres \
#     -n public --clean --if-exists < /opt/exhibit-test/backups/db-<ts>.dump
# =============================================================================
set -Eeuo pipefail
umask 077

BASE=${EXHIBIT_BASE:-/opt/exhibit-test}
STATEDIR=${EXHIBIT_STATEDIR:-/var/lib/exhibit-test}
BACKUPS=$BASE/backups
KEEP_DAYS=${EXHIBIT_BACKUP_KEEP_DAYS:-14}
DB_CONTAINER=supabase-db
TS=$(date -u +%Y%m%dT%H%M%SZ)
STEP=start

install -d -m 700 "$BACKUPS" "$STATEDIR"

status() { printf '%s\n' "$*" >"$STATEDIR/backup.status"; }
on_err() {
  status "fail $TS $STEP"
  echo "backup failed at step $STEP" >&2
  rm -f "$BACKUPS/db-$TS.dump.part" "$BACKUPS/storage-$TS.tgz.part"
}
trap on_err ERR

# One run at a time.
exec 9>"${EXHIBIT_BACKUP_LOCK:-/run/exhibit-test-backup.lock}"
if ! flock -n 9; then
  echo "another backup is running" >&2
  exit 0
fi

STEP=pg_dump
# supabase_admin has local trust in the image's pg_hba, so no password is needed.
docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -d postgres -Fc >"$BACKUPS/db-$TS.dump.part"
mv "$BACKUPS/db-$TS.dump.part" "$BACKUPS/db-$TS.dump"

STEP=verify
docker exec -i "$DB_CONTAINER" pg_restore --list <"$BACKUPS/db-$TS.dump" >/dev/null

STEP=storage
if [[ -d "$BASE/supabase/volumes/storage" ]]; then
  # Exit 1 means a file changed while being read (live uploads): still a usable archive.
  tar -czf "$BACKUPS/storage-$TS.tgz.part" -C "$BASE/supabase/volumes" storage || [[ $? -eq 1 ]]
  mv "$BACKUPS/storage-$TS.tgz.part" "$BACKUPS/storage-$TS.tgz"
fi

STEP=rotate
find "$BACKUPS" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'storage-*.tgz' \) -mtime +"$KEEP_DAYS" -delete

STEP=finished
status "ok $TS"
echo "backup ok $TS: $(du -sh "$BACKUPS/db-$TS.dump" | cut -f1) dump"
