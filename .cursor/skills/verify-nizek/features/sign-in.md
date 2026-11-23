# Local sign-in

Local sign-in creates a real Better Auth session on `http://localhost:3001` without Google OAuth so an agent can drive authenticated pages as any unblocked local user.

## Sub-features

- `signin-gate` shows the local account selector and `Continue as <name>` button on `/sign-in`.
- `signin-submit` signs in and redirects to `/dashboard`.
- `signin-persist` keeps the session active across a full page reload.

## How to get to it (user POV)

- Visit `http://localhost:3001/sign-in` directly.
- Visit any protected route (such as `http://localhost:3001/dashboard`) while signed out and get redirected to `/sign-in`.

## Driving it with cursor-ide-browser

Preconditions:

- `node .cursor/skills/verify-nizek/doctor.mjs` exits `0` with `devLogin.status: 200` and a non-null `devLogin.defaultEmail`.

- **Open sign-in page.** Call `browser_navigate` to `http://localhost:3001/sign-in`, then `browser_snapshot`. A `combobox` named `Local account` and a `button` matching `Continue as <name>` appear.
- **Select account (optional).** Call `browser_select_option` on the `Local account` combobox if testing a specific user.
- **Sign in.** Call `browser_click` on the `Continue as <name>` button. Wait for navigation to `/dashboard` (URL leaves `/sign-in`).
- **Verify dashboard.** Call `browser_snapshot` and `browser_take_screenshot`. The navigation shows `Inbox` and `Projects` (live panel shell) and no sign-in form.
- **Verify persistence.** Call `browser_navigate` to `http://localhost:3001/dashboard` again and `browser_snapshot`. The user remains signed in on `/dashboard` without bouncing back to `/sign-in`.

## Gotchas

- `LocalDevSignIn` only renders when `GET /api/auth/dev-sign-in` returns `200`, which requires `NODE_ENV !== "production"`, `LOCAL_DEV_LOGIN=1`, a valid `LOCAL_DEV_LOGIN_EMAIL` in `.env`, and a localhost/private LAN `Host` header.
- Use `http://localhost:3001` consistently (mixing `localhost` and `127.0.0.1` splits session cookies).
- If the browser is already signed in from an earlier run, `/sign-in` may redirect straight to `/dashboard`—check the URL in `browser_snapshot`.
