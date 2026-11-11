#!/bin/sh
# One process in the local Overmind group. See scripts/local.mjs.
set -eu
cd "$(dirname "$0")/.."
role="${1:?role}"

wait_for_app() {
  i=0
  while [ ! -f .local/ready ]; do
    i=$((i + 1))
    if [ "$i" -gt 600 ]; then
      echo "[$role] the panel did not finish starting" >&2
      exit 1
    fi
    sleep 1
  done
}

case "$role" in
  web)
    echo "[web] waiting for postgres"
    i=0
    until docker compose -f compose.local.yaml exec -T postgres pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
      i=$((i + 1))
      if [ "$i" -gt 600 ]; then
        echo "[web] postgres did not become ready" >&2
        exit 1
      fi
      sleep 1
    done
    npx prisma generate
    node --env-file=.env prisma/migrate.mjs
    mkdir -p .local
    touch .local/ready
    # .env PORT is 3001. Port 3000 belongs to another app on this machine.
    exec npm run dev
    ;;
  worker)
    wait_for_app
    export TSX_TSCONFIG_PATH=tsconfig.worker.json
    # The panel listens on PORT from .env. The worker's health check needs its own port.
    # --env-file does not override a variable that is already set.
    export PORT=3002
    exec node --env-file=.env ./node_modules/.bin/tsx worker.ts
    ;;
  collab)
    wait_for_app
    # The tsx CLI, not --import tsx: this file uses top-level await, which the
    # loader compiles as CommonJS and rejects.
    exec node --env-file=.env ./node_modules/.bin/tsx collab-server.ts
    ;;
  mobile)
    cd ../Nizek-mobile
    # The installed Simulator app is Nizek Staging. This override sends it to the
    # local panel instead of Railway. Port 3001 is the panel; 3000 is another app.
    export EXPO_PUBLIC_API_URL=http://localhost:3001
    exec npm run start:staging
    ;;
  *)
    echo "[local] unknown process: $role" >&2
    exit 1
    ;;
esac
