#!/bin/sh
echo "[start-collab] starting..."
echo "[start-collab] node version: $(node --version)"
echo "[start-collab] working dir: $(pwd)"
echo "[start-collab] files: $(ls /app/collab-server.ts 2>&1)"
echo "[start-collab] tsx: $(ls /app/node_modules/.bin/tsx 2>&1)"
exec node --import tsx /app/collab-server.ts
