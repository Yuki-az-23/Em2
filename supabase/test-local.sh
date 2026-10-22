#!/usr/bin/env bash
# Applies schema.sql to a throwaway PostgreSQL cluster and runs smoke.sql.
# Needs PostgreSQL server binaries (initdb, pg_ctl) and psql. Runs as a non-root
# user because initdb refuses root. Usage: supabase/test-local.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_TEST:-54329}"
WORK="${PGTEST_DIR:-$(mktemp -d)}"
cleanup() { "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$WORK/data" -A trust -U postgres --locale=C.UTF-8 -E UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
"$PGBIN/createdb" -h "$WORK" -p "$PORT" -U postgres hermes
psql -h "$WORK" -p "$PORT" -U postgres -d hermes -v ON_ERROR_STOP=1 -q -f "$HERE/schema.sql"
echo "schema applied"
psql -h "$WORK" -p "$PORT" -U postgres -d hermes -v ON_ERROR_STOP=1 -q -f "$HERE/smoke.sql"
