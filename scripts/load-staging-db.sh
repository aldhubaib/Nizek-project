#!/usr/bin/env bash
# Load the staging database (Railway environment `staging`) with a fresh copy of live.
#
# What it does
#   1. Reads two connection strings from Railway: live (environment `production`,
#      read only) and staging (environment `staging`, the one that gets overwritten).
#   2. Refuses to continue unless the staging string really comes from the environment
#      named `staging`, and unless live and staging are different servers.
#   3. Dumps live with Postgres 18 tools (live is Postgres 18).
#   4. Empties the staging database and restores the dump into it. Stops hard if the
#      restore does not finish or the result does not match live (tables, migrations,
#      indexes, constraints), so a half-loaded staging is never deployed to.
#   5. Clears everything that could reach real people from staging: push subscriptions,
#      push devices, mobile push tokens, the push outbox, login sessions, verification
#      tokens (tables that do not exist yet are skipped).
#   6. Redeploys the staging web app so its pre-deploy step applies any migration the
#      staging code has and live does not. (Migrations are taken from the deployed
#      staging code, never from this checkout.)
#
# Do not deploy to staging while it runs (a deploy would migrate a half-loaded database).
#
# Usage
#   bash scripts/load-staging-db.sh                  # asks for confirmation
#   bash scripts/load-staging-db.sh --yes            # no prompt
#   bash scripts/load-staging-db.sh --yes --no-redeploy
#
# Needs: Railway CLI logged in and linked to nizek-project, Postgres 18 tools
# (brew install postgresql@18), node.
#
# The live database is only ever read. No connection string is ever printed.

set -euo pipefail

SOURCE_ENV="production"
TARGET_ENV="staging"          # fixed on purpose: this script can only ever write to staging
DB_SERVICE="${RAILWAY_DB_SERVICE:-Postgres}"
WEB_SERVICE="${RAILWAY_WEB_SERVICE:-Nizek Projects}"

ASSUME_YES=0
REDEPLOY=1
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --no-redeploy) REDEPLOY=0 ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { printf '\n[load-staging] %s\n' "$*"; }
fail() { printf '\n[load-staging] ERROR: %s\n' "$*" >&2; exit 1; }

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

# --- 2. Connection strings (never printed) ------------------------------------------------
# Prints "<environment name>\t<DATABASE_PUBLIC_URL>" for the Postgres service of one environment.
read_db() {
  railway variables --environment "$1" --service "$DB_SERVICE" --json 2>/dev/null \
    | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const v = JSON.parse(s || "{}");
        process.stdout.write(`${v.RAILWAY_ENVIRONMENT_NAME || ""}\t${v.DATABASE_PUBLIC_URL || ""}\n`);
      });'
}
# Prints "host:port" of a connection string, nothing else.
host_of() { node -e 'const u = new URL(process.argv[1]); process.stdout.write(`${u.hostname}:${u.port}`)' "$1"; }

log "Reading connection strings from Railway (service: $DB_SERVICE)"
LIVE_ENV=""; LIVE_URL=""; TARGET_ENV_SEEN=""; TARGET_URL=""
# The Railway API occasionally answers empty; try a few times before giving up.
for attempt in 1 2 3; do
  IFS=$'\t' read -r LIVE_ENV LIVE_URL < <(read_db "$SOURCE_ENV") || true
  [ -n "$LIVE_URL" ] && break
  log "Live connection string not returned (attempt $attempt of 3), retrying…"; sleep 5
done
for attempt in 1 2 3; do
  IFS=$'\t' read -r TARGET_ENV_SEEN TARGET_URL < <(read_db "$TARGET_ENV") || true
  [ -n "$TARGET_URL" ] && break
  log "Staging connection string not returned (attempt $attempt of 3), retrying…"; sleep 5
done

[ -n "$LIVE_URL" ] || fail "Could not read DATABASE_PUBLIC_URL for environment $SOURCE_ENV.
Run: railway login && railway link --project nizek-project"
[ -n "$TARGET_URL" ] || fail "Could not read DATABASE_PUBLIC_URL for environment $TARGET_ENV.
Does the staging environment exist, and does its Postgres have a TCP proxy?"

# --- 3. Guards: only ever write to staging, never to live ---------------------------------
[ "$LIVE_ENV" = "$SOURCE_ENV" ] || fail "The source variables did not come from environment '$SOURCE_ENV' (got '$LIVE_ENV'). Stopping."
[ "$TARGET_ENV_SEEN" = "$TARGET_ENV" ] || fail "The target variables did not come from environment '$TARGET_ENV' (got '$TARGET_ENV_SEEN'). Stopping."
[ "$LIVE_URL" != "$TARGET_URL" ] || fail "Live and staging resolve to the same connection string. Stopping."

LIVE_HOST="$(host_of "$LIVE_URL")"
TARGET_HOST="$(host_of "$TARGET_URL")"
[ "$LIVE_HOST" != "$TARGET_HOST" ] || fail "Live and staging are the same server ($LIVE_HOST). Stopping."

log "Source (read only): $SOURCE_ENV  $LIVE_HOST"
log "Target (overwritten): $TARGET_ENV  $TARGET_HOST"

# Both strings go through Railway's TCP proxy. Keepalives make a dropped connection fail
# within a couple of minutes instead of hanging for an hour; connect_timeout bounds connects.
KEEPALIVE="keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=5&connect_timeout=20"
with_keepalive() { case "$1" in *\?*) printf '%s&%s' "$1" "$KEEPALIVE" ;; *) printf '%s?%s' "$1" "$KEEPALIVE" ;; esac; }
LIVE_CONN="$(with_keepalive "$LIVE_URL")"
TARGET_CONN="$(with_keepalive "$TARGET_URL")"

# Structural fingerprint of a database: base tables, applied migrations, indexes, constraints.
# Equal on live and staging after a complete restore; data counts may drift while we copy.
SHAPE_SQL="select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') || ' tables, ' ||
  (select count(*) from \"_prisma_migrations\" where finished_at is not null and rolled_back_at is null) || ' migrations, ' ||
  (select count(*) from pg_indexes where schemaname = 'public') || ' indexes, ' ||
  (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public') || ' constraints'"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf '\nEverything in the %s database at %s will be replaced. Type "%s" to continue: ' "$TARGET_ENV" "$TARGET_HOST" "$TARGET_ENV"
  read -r answer
  [ "$answer" = "$TARGET_ENV" ] || fail "Cancelled."
fi

# --- 4. Dump live -------------------------------------------------------------------------
WORK="$(mktemp -d -t nizek-staging-db)"
trap 'rm -rf "$WORK"' EXIT
DUMP="$WORK/live.dump"

log "Dumping live (read-only)…"
"$PG_BIN/pg_dump" --format=custom --no-owner --no-privileges --file "$DUMP" "$LIVE_CONN"
log "Dump size: $(du -h "$DUMP" | cut -f1)"
LIVE_SHAPE="$(PGOPTIONS='-c default_transaction_read_only=on' "$PG_BIN/psql" "$LIVE_CONN" -At -c "$SHAPE_SQL")"
log "Live has $LIVE_SHAPE"

# Some dumps carry their own `CREATE SCHEMA public`; create it ourselves only when they don't.
CREATE_PUBLIC="CREATE SCHEMA public;"
if "$PG_BIN/pg_restore" --list "$DUMP" | grep -Eq ' SCHEMA - public( |$)'; then CREATE_PUBLIC=""; fi

# --- 5. Empty staging and restore ---------------------------------------------------------
# Do not deploy to staging while this runs: a deploy would run migrations against a half
# loaded database (and the deploy scripts would try to "baseline" it).
log "Emptying the staging database"
PGOPTIONS='-c client_min_messages=warning' "$PG_BIN/psql" "$TARGET_CONN" -v ON_ERROR_STOP=1 -q <<SQL
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE datname = current_database() AND pid <> pg_backend_pid();
DROP SCHEMA IF EXISTS public CASCADE;
$CREATE_PUBLIC
SQL

log "Restoring into staging (do not interrupt)…"
RESTORE_LOG="$WORK/restore.log"
if ! "$PG_BIN/pg_restore" --no-owner --no-privileges --exit-on-error --jobs=4 --dbname "$TARGET_CONN" "$DUMP" 2>"$RESTORE_LOG"; then
  printf '[load-staging] pg_restore output (last 20 lines):\n' >&2
  tail -n 20 "$RESTORE_LOG" | sed 's/^/    /' >&2
  fail "The restore did not finish. Staging is half loaded: do not deploy to staging, fix the cause (usually the connection) and run this script again."
fi

# --- 6. Check the copy before touching anything else -------------------------------------
STAGING_SHAPE="$("$PG_BIN/psql" "$TARGET_CONN" -At -c "$SHAPE_SQL")"
[ "$STAGING_SHAPE" = "$LIVE_SHAPE" ] \
  || fail "Staging does not match live after the restore (live: $LIVE_SHAPE; staging: $STAGING_SHAPE). Do not deploy to staging; run this script again."
log "Restore checked: staging has $STAGING_SHAPE, same as live"

# --- 7. Make the copy safe: nothing on staging may reach a real device or mailbox ----------
log "Clearing push subscriptions, push devices, mobile push tokens, push outbox, login sessions, verification tokens"
"$PG_BIN/psql" "$TARGET_CONN" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$
DECLARE
  wanted text[] := ARRAY['PushSubscription', 'PushDevice', 'MobilePushToken', 'PushOutbox', 'AuthSession', 'Verification'];
  present text[] := '{}';
  t text;
BEGIN
  FOREACH t IN ARRAY wanted LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      present := present || format('public.%I', t);
    END IF;
  END LOOP;
  IF array_length(present, 1) > 0 THEN
    EXECUTE 'TRUNCATE TABLE ' || array_to_string(present, ', ');
  END IF;
END $$;
SQL

# --- 8. Bring the schema up to what the staging code expects -----------------------------
if [ "$REDEPLOY" -eq 1 ]; then
  log "Redeploying the staging web app (its pre-deploy step runs the migrations of the deployed code)"
  railway deployment redeploy --service "$WEB_SERVICE" --environment "$TARGET_ENV" --yes >/dev/null \
    || printf '[load-staging] Redeploy could not be started; run it from the Railway dashboard if staging code has newer migrations than live.\n'
fi

# --- 9. Summary ---------------------------------------------------------------------------
log "Done. Staging now holds:"
"$PG_BIN/psql" "$TARGET_CONN" -At -F ' ' -c '
  select count(*) || '"'"' users'"'"' from "User"
  union all select count(*) || '"'"' projects'"'"' from "Project"
  union all select count(*) || '"'"' tasks'"'"' from "Task"
  union all select count(*) || '"'"' messages'"'"' from "Message"
  union all select count(*) || '"'"' push subscriptions (cleared)'"'"' from "PushSubscription"
  union all select count(*) || '"'"' login sessions (cleared)'"'"' from "AuthSession";' \
  | sed 's/^/    /'
