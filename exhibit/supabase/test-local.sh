#!/usr/bin/env bash
# Applies schema.sql to a throwaway PostgreSQL cluster (twice: it must be idempotent)
# and runs smoke.sql. Needs PostgreSQL server binaries (initdb, pg_ctl) and psql. Runs
# as a non-root user because initdb refuses root.
#
# Usage: exhibit/supabase/test-local.sh [--supabase-defaults]
#   --supabase-defaults (or SUPABASE_DEFAULTS=1) first applies
#   demo/supabase-defaults.sql, which emulates Supabase: pgcrypto in schema
#   `extensions` and default privileges granting anon/authenticated ALL in public.
#   CI runs the schema job this way.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEFAULTS="${SUPABASE_DEFAULTS:-0}"
for arg in "$@"; do
  case "$arg" in
    --supabase-defaults) DEFAULTS=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
PGBIN="${PGBIN:-$(find /usr/lib/postgresql -maxdepth 2 -type d -name bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_TEST:-54329}"
WORK="${PGTEST_DIR:-$(mktemp -d)}"
cleanup() { "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$WORK/data" -A trust -U postgres --locale=C.UTF-8 -E UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
"$PGBIN/createdb" -h "$WORK" -p "$PORT" -U postgres hermes
run() { psql -h "$WORK" -p "$PORT" -U postgres -d hermes -v ON_ERROR_STOP=1 -q -f "$1"; }
if [ "$DEFAULTS" = 1 ]; then
  run "$HERE/../demo/supabase-defaults.sql"
  echo "supabase defaults applied"
fi
run "$HERE/schema.sql"
run "$HERE/schema.sql"
echo "schema applied twice"
run "$HERE/smoke.sql"
