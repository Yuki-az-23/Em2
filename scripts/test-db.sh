#!/usr/bin/env bash
# Start a throwaway PostgreSQL 16 for integration tests and print its URL.
#
#   eval "$(scripts/test-db.sh start)"   # exports EM2_TEST_DATABASE_URL
#   scripts/test-db.sh stop
#
# Uses Docker when a daemon is reachable, otherwise local PostgreSQL binaries
# (run as the postgres user when invoked as root, since initdb refuses root).
set -euo pipefail

STATE_DIR="${EM2_TEST_DB_DIR:-${TMPDIR:-/tmp}/em2-test-db}"
PORT="${EM2_TEST_DB_PORT:-54329}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"

as_pg() {
  if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

start() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker rm -f em2-test-db >/dev/null 2>&1 || true
    docker run -d --name em2-test-db -e POSTGRES_PASSWORD=em2 -e POSTGRES_DB=em2_test -p "127.0.0.1:${PORT}:5432" postgres:16 >/dev/null
    for _ in $(seq 1 60); do
      docker exec em2-test-db pg_isready -U postgres -d em2_test >/dev/null 2>&1 && break
      sleep 1
    done
    echo "export EM2_TEST_DATABASE_URL=postgres://postgres:em2@127.0.0.1:${PORT}/em2_test?sslmode=disable"
    return
  fi
  [ -x "${PGBIN}/initdb" ] || { echo "no docker and no PostgreSQL binaries found" >&2; exit 1; }
  if [ ! -f "${STATE_DIR}/data/PG_VERSION" ]; then
    mkdir -p "${STATE_DIR}"
    [ "$(id -u)" = 0 ] && chown postgres "${STATE_DIR}"
    as_pg "${PGBIN}/initdb" -D "${STATE_DIR}/data" -U postgres --auth=trust -E UTF8 >/dev/null
  fi
  if ! as_pg "${PGBIN}/pg_ctl" -D "${STATE_DIR}/data" status >/dev/null 2>&1; then
    as_pg "${PGBIN}/pg_ctl" -D "${STATE_DIR}/data" -l "${STATE_DIR}/log" -w \
      -o "-p ${PORT} -k ${STATE_DIR} -c listen_addresses=127.0.0.1" start >/dev/null
  fi
  as_pg "${PGBIN}/psql" -h 127.0.0.1 -p "${PORT}" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='em2_test'" | grep -q 1 \
    || as_pg "${PGBIN}/createdb" -h 127.0.0.1 -p "${PORT}" -U postgres em2_test
  echo "export EM2_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:${PORT}/em2_test?sslmode=disable"
}

stop() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker rm -f em2-test-db >/dev/null 2>&1 || true
  fi
  if [ -f "${STATE_DIR}/data/PG_VERSION" ]; then
    as_pg "${PGBIN}/pg_ctl" -D "${STATE_DIR}/data" -m fast stop >/dev/null 2>&1 || true
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
