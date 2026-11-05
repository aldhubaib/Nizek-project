#!/usr/bin/env bash
# Pull the live (Railway) database into a local copy for testing the UI with real data.
#
# What it does
#   1. Reads the live connection string from Railway. The Railway CLI must be logged in
#      and linked to the project:  railway link --project nizek-project --environment production
#   2. Dumps live with Postgres 18 tools (live is Postgres 18; the Postgres 15 tools that
#      come first on PATH cannot read it).
#   3. Recreates the local database (default: nizek_live on the local Postgres 18 server,
#      port 5433) and restores the dump into it.
#   4. Clears everything that could reach real people from a laptop: push subscriptions,
#      push devices, the push outbox, login sessions and verification tokens.
#   5. Applies migrations that exist in this checkout but are not on live yet.
#
# Usage
#   npm run db:pull-live
#   PG_PORT=5433 PG_DB=nizek_live scripts/pull-live-db.sh
#
# Then point .env at the copy and restart `npm run dev`:
#   DATABASE_URL="postgresql://$USER@localhost:5433/nizek_live"
#   DIRECT_DATABASE_URL="postgresql://$USER@localhost:5433/nizek_live"
#
# The live database is only ever read. Nothing here writes to Railway.

set -euo pipefail

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5433}"
PG_DB="${PG_DB:-nizek_live}"
PG_USER="${PG_USER:-$USER}"
RAILWAY_DB_SERVICE="${RAILWAY_DB_SERVICE:-Postgres}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { printf '\n[pull-live] %s\n' "$*"; }
fail() { printf '\n[pull-live] ERROR: %s\n' "$*" >&2; exit 1; }

# --- 1. Tools -----------------------------------------------------------------------------
PG_BIN="${PG_BIN:-}"
if [ -z "$PG_BIN" ]; then
  for candidate in "$(brew --prefix postgresql@18 2>/dev/null)/bin" /opt/homebrew/opt/postgresql@18/bin; do
    if [ -x "$candidate/pg_dump" ]; then PG_BIN="$candidate"; break; fi
  done
fi
[ -n "$PG_BIN" ] && [ -x "$PG_BIN/pg_dump" ] || fail "Postgres 18 tools not found. Install with: brew install postgresql@18"
command -v railway >/dev/null || fail "Railway CLI not found. Install with: brew install railway"
command -v node >/dev/null || fail "node not found"

log "Using $("$PG_BIN/pg_dump" --version)"

# --- 2. Local server ----------------------------------------------------------------------
if ! "$PG_BIN/pg_isready" -h "$PG_HOST" -p "$PG_PORT" -q; then
  fail "No Postgres listening on $PG_HOST:$PG_PORT.
Start the local Postgres 18 server with:
  $PG_BIN/pg_ctl -D /opt/homebrew/var/postgresql@18 -o \"-p $PG_PORT\" -l /opt/homebrew/var/log/postgresql@18.log start"
fi

# --- 3. Live connection string (never printed) -------------------------------------------
log "Reading the live connection string from Railway (service: $RAILWAY_DB_SERVICE)"
LIVE_URL="$(railway variables --service "$RAILWAY_DB_SERVICE" --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s||"{}");process.stdout.write(v.DATABASE_PUBLIC_URL||"")})')"
[ -n "$LIVE_URL" ] || fail "Could not read DATABASE_PUBLIC_URL from Railway.
Run: railway login && railway link --project nizek-project --environment production"

# --- 4. Dump live -------------------------------------------------------------------------
WORK="$(mktemp -d -t nizek-live-db)"
trap 'rm -rf "$WORK"' EXIT
DUMP="$WORK/live.dump"

log "Dumping live (read-only)…"
"$PG_BIN/pg_dump" --format=custom --no-owner --no-privileges --file "$DUMP" "$LIVE_URL"
log "Dump size: $(du -h "$DUMP" | cut -f1)"

# --- 5. Recreate the local copy -----------------------------------------------------------
LOCAL_URL="postgresql://$PG_USER@$PG_HOST:$PG_PORT/$PG_DB"

log "Recreating local database $PG_DB on $PG_HOST:$PG_PORT"
"$PG_BIN/dropdb" --if-exists --force -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" "$PG_DB"
"$PG_BIN/createdb" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" "$PG_DB"

log "Restoring…"
RESTORE_LOG="$WORK/restore.log"
if ! "$PG_BIN/pg_restore" --no-owner --no-privileges --jobs=4 --dbname "$LOCAL_URL" "$DUMP" 2>"$RESTORE_LOG"; then
  printf '[pull-live] pg_restore reported problems (usually harmless ownership notices):\n'
  tail -n 20 "$RESTORE_LOG" | sed 's/^/    /'
fi

# --- 6. Make the copy safe to use from a laptop -------------------------------------------
log "Clearing push subscriptions, push devices, push outbox, login sessions, verification tokens"
"$PG_BIN/psql" "$LOCAL_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
TRUNCATE TABLE "PushSubscription", "PushDevice", "PushOutbox", "AuthSession", "Verification";
SQL

# --- 7. Migrations present here but not on live yet ---------------------------------------
log "Applying migrations from this checkout"
DATABASE_URL="$LOCAL_URL" DIRECT_DATABASE_URL="$LOCAL_URL" npx prisma migrate deploy

# --- 8. Summary ---------------------------------------------------------------------------
log "Done. The copy now holds:"
"$PG_BIN/psql" "$LOCAL_URL" -At -F ' ' -c '
  select count(*) || '"'"' users'"'"' from "User"
  union all select count(*) || '"'"' projects'"'"' from "Project"
  union all select count(*) || '"'"' tasks'"'"' from "Task"
  union all select count(*) || '"'"' messages'"'"' from "Message"
  union all select count(*) || '"'"' push subscriptions (cleared)'"'"' from "PushSubscription";' \
  | sed 's/^/    /'

cat <<EOF

[pull-live] To use it, .env needs:
    DATABASE_URL="$LOCAL_URL"
    DIRECT_DATABASE_URL="$LOCAL_URL"
then restart: npm run dev
EOF
