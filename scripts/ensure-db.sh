#!/usr/bin/env bash
# Ensures the SupplyGuard PostgreSQL cluster is running.
# Safe to call repeatedly — a no-op when it is already up.
set -euo pipefail

PGDATA="$HOME/.local/share/supplyguard/pgdata"
SOCKDIR="$HOME/.local/share/supplyguard"
LOG="$HOME/.local/share/supplyguard/server.log"
PORT=5432

if command -v pg_ctl >/dev/null 2>&1 && pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  exit 0
fi

# Socket dir must be writable by this user; /run/postgresql is not.
mkdir -p "$SOCKDIR"

pg_ctl -D "$PGDATA" -o "-p $PORT -k $SOCKDIR -c listen_addresses=localhost" -l "$LOG" start
