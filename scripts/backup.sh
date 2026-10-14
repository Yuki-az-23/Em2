#!/usr/bin/env bash
# Nightly backup of an EM2 docker-compose deployment: a compressed pg_dump and
# a tarball of the media volume, keeping the last 14 of each.
#
#   scripts/backup.sh [BACKUP_DIR]          (default /var/backups/em2)
#   crontab: 17 3 * * * /path/to/Em2/scripts/backup.sh >> /var/log/em2-backup.log 2>&1
#
# Restore: gunzip -c em2-<stamp>.sql.gz | docker compose -f deploy/docker-compose.yml exec -T postgres psql -U em2 -d em2
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${1:-/var/backups/em2}"
KEEP="${EM2_BACKUP_KEEP:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
COMPOSE=(docker compose -f "$ROOT/deploy/docker-compose.yml")
mkdir -p "$DIR"
umask 077
"${COMPOSE[@]}" exec -T postgres pg_dump -U em2 -d em2 --format=plain | gzip -9 > "$DIR/em2-$STAMP.sql.gz.part"
mv "$DIR/em2-$STAMP.sql.gz.part" "$DIR/em2-$STAMP.sql.gz"
docker run --rm -v em2_media:/media:ro -v "$DIR:/backup" busybox:1.36 tar czf "/backup/media-$STAMP.tar.gz" -C /media . 
for pattern in 'em2-*.sql.gz' 'media-*.tar.gz'; do
  ls -1t "$DIR"/$pattern 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
done
echo "backup $STAMP written to $DIR"
