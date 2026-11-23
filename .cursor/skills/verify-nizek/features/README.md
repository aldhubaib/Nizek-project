# Nizek verification map

Maintained index of user-facing journeys in `Nizek-project` (live panel `/dashboard` and new frontend `/next`). Read this index before driving a feature.

## Baseline preconditions

- Local stack running at `http://localhost:3001` via `npm run local`.
- `node .cursor/skills/verify-nizek/doctor.mjs` exits `0` (`health.dbOk: true`, `devLogin.status: 200`).
- `.env` has `LOCAL_DEV_LOGIN=1` and `LOCAL_DEV_LOGIN_EMAIL` pointing to an existing unblocked user in local Postgres.
- Browser driven via `cursor-ide-browser` MCP at `http://localhost:3001`.

## Driving conventions

- Start from the baseline state unless a feature states otherwise.
- Prefer accessible names and roles from `browser_snapshot` over CSS selectors or coordinates.
- Restore or delete any scratch records created during mutation tests. Keep proof artifacts in `/tmp/nizek-verify/<run-id>/`.

## Proof and skip reporting

- Capture both the action and the resulting state.
- UI proof includes a `browser_snapshot` check and a `browser_take_screenshot` saved under `/tmp/nizek-verify/<run-id>/<feature>/`.
- Check console/runtime errors via `browser_cdp` or snapshot before declaring a flow clean.
- If a precondition is missing (e.g., empty DB with no projects or threads), report the unmet precondition rather than weakening the check.

## Features

- [Local sign-in](./sign-in.md) covers signing in via `/sign-in` (`LocalDevSignIn`), landing on `/dashboard`, and verifying session persistence across reload.
- [Projects](./projects.md) covers listing projects and opening a project detail view on both `/dashboard/projects` and `/next/projects`.
- [Inbox & messages](./messages.md) covers opening `/dashboard/messages`, selecting a thread, and verifying thread rendering.
- [New frontend panes](./next-ui-panes.md) covers navigating `/next`, sidebar context switching into a project, and opening a record in a side pane.
