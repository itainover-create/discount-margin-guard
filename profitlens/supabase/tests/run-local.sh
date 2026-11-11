#!/usr/bin/env bash
# Spins up a throwaway local Postgres, applies the migration and runs the RLS test-suite.
# Requires PostgreSQL 15+ binaries (initdb, pg_ctl, psql). Usage: npm run test:rls
set -euo pipefail
cd "$(dirname "$0")/.."
BIN="${PG_BIN:-$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DIR="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
RUN() { if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
cleanup() { RUN "$BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
chmod 755 "$DIR"
RUN "$BIN/initdb -D $DIR/data -U postgres -A trust" >/dev/null
RUN "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -c listen_addresses=127.0.0.1 -k $DIR' -w start" >/dev/null
P="psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create extension if not exists pgcrypto" -f tests/00_local_auth_stub.sql
$P -f migrations/0001_profitlens_schema.sql
$P -f tests/rls_test.sql 2>&1 | grep -E "ok:|FAILED|ERROR|ALL RLS" 
