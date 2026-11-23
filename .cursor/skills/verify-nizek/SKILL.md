---
name: verify-nizek
description: Drive the local Nizek web app (live panel at /dashboard and new frontend at /next) like a real user to reproduce bugs, exercise features, and capture verifiable proof. Use whenever proving UI, auth, routing, or server-action behavior in Nizek-project.
---

# Verify Nizek

Drive the running `Nizek-project` web app at `http://localhost:3001` through the real browser (`cursor-ide-browser` MCP) and local Postgres/Redis/Centrifugo stack.

Read [`features/README.md`](./features/README.md) before driving a feature.

## Launch

`Nizek-project` runs as a single local stack managed by `npm run local` (Docker Compose for Postgres/Redis/Centrifugo + Overmind for `web`, `worker`, `collab`, and `mobile`).

1. **Check whether it is already running** (never double-start):
   ```bash
   node .cursor/skills/verify-nizek/doctor.mjs
   ```
   If exit code is `0`, the stack is already up. Record `STARTED_BY_RUN=0` so cleanup leaves the user's running stack alone.

2. **Otherwise start the local stack** (requires Docker Desktop running and `.env` present with `LOCAL_DEV_LOGIN=1` and `LOCAL_DEV_LOGIN_EMAIL`):
   ```bash
   # Run in background (block_until_ms: 0) with required_permissions: ["all"]
   npm run local
   ```
   Record `STARTED_BY_RUN=1`.

3. **Wait for ready** (Postgres `pg_isready`, `prisma generate`, `prisma/migrate.mjs`, and Next.js dev server on port `3001`):
   ```bash
   for i in $(seq 1 90); do
     if node .cursor/skills/verify-nizek/doctor.mjs >/dev/null 2>&1; then
       node .cursor/skills/verify-nizek/doctor.mjs
       break
     fi
     sleep 2
   done
   ```
   Ready means `doctor.mjs` exits `0` (`/api/health` returns `200 {"status":"ok"}` after `SELECT 1` on Postgres, `/api/version` returns `200`, and `/api/auth/dev-sign-in` returns `200` with at least one local user).

4. **Isolation:** Only one local stack runs per machine (shared Overmind socket `.overmind.local.sock`, port `3001`, Docker volume `nizek-panel-pgdata`). Do not start a second instance. Never run `npm run local:reset` during verification.

## Doctor

Run the read-only health check before driving any flow or whenever anything looks off:

```bash
node .cursor/skills/verify-nizek/doctor.mjs
```

It checks:
- `GET http://127.0.0.1:3001/api/health` (`200`, `status === "ok"`, Postgres reachable)
- `GET http://127.0.0.1:3001/api/version` (`200`, build/release version)
- `GET http://127.0.0.1:3001/api/auth/dev-sign-in` (`200`, local dev login gate open and seeded user present)

If `/api/auth/dev-sign-in` returns `404`, check `.env` for `LOCAL_DEV_LOGIN=1` and `LOCAL_DEV_LOGIN_EMAIL=<seeded user>` (or load local data with `npm run local:data` if the DB is empty).

## Drive

Use the `cursor-ide-browser` MCP tools (`browser_navigate`, `browser_lock`, `browser_snapshot`, `browser_click`, `browser_fill`, `browser_select_option`, `browser_take_screenshot`, `browser_cdp`) against `http://localhost:3001`.

- Always use `http://localhost:3001` (not `127.0.0.1` in the browser) so Better Auth session cookies and `LOCAL_DEV_LOGIN` host checks match.
- Prefer accessible names/roles from `browser_snapshot` over CSS selectors or coordinates.
- Lock the tab (`browser_lock({ action: "lock" })`) during multi-step flows and unlock (`browser_lock({ action: "unlock" })`) when done.
- For unit/component checks alongside UI proof: `npm test` (Vitest). For existing Playwright specs: `npm run test:e2e`.

## Evidence

Write proof artifacts outside the git working tree so they survive cleanup and never dirty `git status`:

```bash
RUN_ID="$(date +%Y%m%d-%H%M%S)"
PROOF_DIR="/tmp/nizek-verify/${RUN_ID}"
mkdir -p "${PROOF_DIR}"
```

Proof standards:
- Exercise the real user path (click buttons, fill forms, navigate routes)—never call internal setters or bypass auth.
- Capture both the **action** and the **resulting state** (not only the final screen).
- Save `browser_take_screenshot` outputs or copy captured screenshots into `${PROOF_DIR}/<feature>/` along with a short `summary.txt` recording the URL, feature ID, doctor output, and any observed console/network errors.
- For mutations (creating/editing a record, sending a message), reload or open a second view to prove persistence, then clean up test records if you created any.

## Cleanup

- If `STARTED_BY_RUN=1`, stop the stack cleanly with:
  ```bash
  npm run local:stop
  ```
  Never kill `node` or `docker` by process name.
- If `STARTED_BY_RUN=0`, leave the user's running stack up.
- Always unlock the browser tab (`browser_lock({ action: "unlock" })`).
- **Never delete `${PROOF_DIR}` during cleanup.** Verify after cleanup that proof artifacts still exist at `${PROOF_DIR}`.

## Helpers

- `node .cursor/skills/verify-nizek/doctor.mjs` — read-only health, version, and local-dev-login check against `http://127.0.0.1:3001` (override base URL with `NIZEK_URL=http://localhost:3001`).
