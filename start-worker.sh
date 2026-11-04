#!/bin/sh
echo "[start-worker] starting..."
echo "[start-worker] node version: $(node --version)"
echo "[start-worker] working dir: $(pwd)"
echo "[start-worker] files: $(ls /app/worker.ts 2>&1)"
echo "[start-worker] tsx: $(ls /app/node_modules/.bin/tsx 2>&1)"
# Apply pending migrations first so the worker never boots against a schema
# that lacks the columns/tables it queries (failCount, PushOutbox). `migrate
# deploy` takes an advisory lock, so racing the web replicas is safe; if the
# web already migrated this is a no-op. Skipped when DATABASE_URL is unset.
node /app/prisma/migrate.mjs || { echo "[start-worker] migration failed; refusing to start"; exit 1; }
# tsconfig.worker.json gives tsx the `@/` alias and the `server-only` stub
# the shared src/lib modules need outside Next.
export TSX_TSCONFIG_PATH=/app/tsconfig.worker.json
exec node --import tsx /app/worker.ts
