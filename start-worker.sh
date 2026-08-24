#!/bin/sh
echo "[start-worker] starting..."
echo "[start-worker] node version: $(node --version)"
echo "[start-worker] working dir: $(pwd)"
echo "[start-worker] files: $(ls /app/worker.ts 2>&1)"
echo "[start-worker] tsx: $(ls /app/node_modules/.bin/tsx 2>&1)"
exec node --import tsx /app/worker.ts
