#!/bin/sh
# Railway build for the web service (railway.toml -> buildCommand).
#
# Produces .next/standalone with static assets and public/ in place, then
# VERIFIES the service worker is reachable at the path browsers request.
#
# Why this is a script and not a one-liner: two bugs hid in the old one-liner.
#   1. `cp -r public .next/standalone/public` copies public INSIDE the target
#      when the target already exists. Next's output tracing pre-creates
#      .next/standalone/public/branding-defaults (branding-icon-route.ts reads
#      it from process.cwd()), so sw.js ended up at public/public/sw.js and
#      https://panel.nizek.com/sw.js returned 404. No service worker => no
#      push for every fresh install, on every platform.
#   2. `VAR=x npm run build && sed ... $VAR` only sets VAR for npm; the sed saw
#      an empty string, so the @BUILD_VERSION stamp never changed sw.js bytes.
set -eu

export NEXT_PUBLIC_APP_BUILD_TIME="${NEXT_PUBLIC_APP_BUILD_TIME:-$(date +%s)000}"
echo "[build] NEXT_PUBLIC_APP_BUILD_TIME=$NEXT_PUBLIC_APP_BUILD_TIME"

npm run build

# Stamp the SW so its bytes change on every deploy (browsers re-fetch and
# byte-compare sw.js to decide whether an update exists).
# (no `sed -i`: GNU and BSD disagree on its syntax; a temp file works on both.)
sed "s|// @BUILD_VERSION.*|// @BUILD_VERSION $NEXT_PUBLIC_APP_BUILD_TIME|" public/sw.js > public/sw.js.tmp
mv public/sw.js.tmp public/sw.js
head -1 public/sw.js

# Copy CONTENTS (trailing /.) so an existing target dir is merged, not nested.
mkdir -p .next/standalone/.next/static .next/standalone/public
cp -r .next/static/. .next/standalone/.next/static/
cp -r public/. .next/standalone/public/

# Fail the build rather than ship a server that 404s the service worker.
for f in sw.js sw-lib.js sw-cache.js offline.html; do
  if [ ! -f ".next/standalone/public/$f" ]; then
    echo "[build] FATAL: .next/standalone/public/$f missing" >&2
    ls -la .next/standalone/public >&2
    exit 1
  fi
done
if [ -d .next/standalone/public/public ]; then
  echo "[build] FATAL: public/ was nested inside standalone/public" >&2
  exit 1
fi
grep -q "// @BUILD_VERSION $NEXT_PUBLIC_APP_BUILD_TIME" .next/standalone/public/sw.js || {
  echo "[build] FATAL: sw.js build stamp missing" >&2
  exit 1
}
echo "[build] standalone ready: sw.js, sw-lib.js, sw-cache.js, offline.html in place"
