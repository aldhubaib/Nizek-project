# Notification QA — manual test matrix

How notifications are supposed to behave (WhatsApp model), what is covered by
automated tests, and the manual checks to run per platform after any change to
the notification pipeline.

## The intended behavior

| App state on a device | What the user gets |
| --- | --- |
| App focused and visible (user is looking at it) | In-app chime + bell badge. **No OS banner** on this device. |
| App open but backgrounded / minimized / another window focused | **OS push banner with the OS notification sound.** |
| App closed / browser closed / phone locked | **OS push banner with the OS notification sound.** |
| Viewing the exact thread the message is for | Message appears in place. No chime, no banner. |
| Notification read on another device | Banner disappears on all open devices; badge re-syncs everywhere. |
| Thread muted / type disabled in preferences | Nothing, anywhere, on any device. |

## Architecture recap

- **Bell + chime (in-app):** Postgres `Notification` rows + Centrifugo
  `notification.new` events. Chime policy: `src/lib/notification-sound-policy.ts`.
- **OS banners:** Web Push (VAPID) → `public/sw.js`. The server **always
  sends** to every registered device; each device's service worker suppresses
  the banner only when a tab is focused AND visible there
  (`public/sw-lib.js: shouldShowPushNotification`).
- **Delivery audit:** every send attempt is recorded in `PushDeliveryLog`
  (admin → Settings → Member Notifications → Push health).
- **Preferences/mutes:** `NotificationPreference` + `MutedThread`, enforced
  server-side in `src/lib/notify.ts` before rows/pushes are created.

## Automated coverage (runs in CI on every push)

| Layer | Tool | What it proves |
| --- | --- | --- |
| `tests/unit/sw-lib.test.ts` | Vitest | Banner show/suppress decision, payload parsing, tag/renotify options |
| `tests/unit/push-core.test.ts` | Vitest | Push body shape, TTL, retry-once policy, stale-subscription detection |
| `tests/unit/notification-prefs.test.ts` | Vitest | Preference and mute filtering |
| `tests/unit/notification-sound-policy.test.ts` | Vitest | Chime policy (event type, focus, same-thread suppression) |
| `tests/unit/notification-sound.test.ts` | Vitest | Sound preference storage + playback fallback |
| `tests/e2e/sw-registration.spec.ts` | Playwright (chromium, firefox, webkit) | The real `sw.js` registers; `sw-lib` behaves identically per engine |
| `tests/e2e/push-display.spec.ts` | Playwright (firefox headless; chromium headed in CI) | Real SW push path: banner shown, focused-tab suppression, tag replacement, dismissal by tag |

Run locally: `npm test` (unit) and `npm run test:e2e` (E2E).

## Manual test matrix

Use two accounts (A, B) and send DMs from B to A. Repeat the grid per platform.

### 1. Desktop web (Chrome, Edge, Firefox, Safari)

| # | Setup on A's device | Action | Expected |
| --- | --- | --- | --- |
| 1 | App focused, on dashboard | B sends DM | Chime + bell count. No OS banner. |
| 2 | App open, another app focused | B sends DM | OS banner + OS sound. No chime. |
| 3 | Browser fully closed (Chrome/Edge; Firefox/Safari deliver on next open) | B sends DM | OS banner + OS sound. |
| 4 | Viewing the exact conversation with B | B sends DM | Message appears. No chime, no banner. |
| 5 | Viewing a DIFFERENT conversation | B sends DM | Chime + bell. No banner. |
| 6 | Banner visible from step 2 | A opens the thread on a second device | Banner disappears on the first device; badge syncs. |
| 7 | B sends 3 quick messages while A backgrounded | — | ONE banner (latest message), not three. |
| 8 | A muted the thread (3-dot menu → Mute) | B sends DM | Nothing on any device. Thread still updates when opened. |
| 9 | Account → "Direct messages" toggle off | B sends DM | Nothing. Turn back on → notifications resume. |
| 10 | First visit of a session, before ANY click | B sends DM while focused | Chime may be silent once (autoplay). After one click anywhere, chimes work. Diagnostics shows "waiting for first tap". |

### 2. Installed PWA (Windows / macOS / Android)

Same grid as desktop web, plus:

| # | Action | Expected |
| --- | --- | --- |
| 11 | Install via the install prompt, enable notifications | App-icon badge shows unread count. |
| 12 | Close the PWA window entirely | Push still arrives (OS banner + sound). |
| 13 | Read everything on another device | App-icon badge clears. |

### 3. iPhone / iPad (iOS 16.4+)

| # | Action | Expected |
| --- | --- | --- |
| 14 | Open the site in Safari (NOT installed) | No push support. Account page explains: install to home screen first. Install banner says notifications require install. |
| 15 | Add to Home Screen, open the installed app | Notifications toggle works after tapping Enable (permission prompt appears — must be from the tap). |
| 16 | Lock the phone | B sends DM → lock-screen notification + sound. |
| 17 | App open and focused | B sends DM → chime only, no banner. |

### 4. Diagnostics + admin

| # | Action | Expected |
| --- | --- | --- |
| 18 | Account → Notification diagnostics | All checks green on a healthy device. "Send test notification" produces a bell entry + push, and the delivery appears in the panel's log. |
| 19 | Admin → Settings → Member Notifications → Push health | Success rate visible; users without devices listed; VAPID/Centrifugo misconfiguration shows a red/amber alert. |
| 20 | Block notifications in browser site settings, run diagnostics | Permission check turns red with instructions. |

## Known platform limits

- **iOS Safari tab (not installed):** no web push at all — Apple limitation.
  The UI directs users to install.
- **Firefox/Safari closed completely:** push arrives when the browser next
  opens (they have no out-of-browser push service on desktop).
- **Chime before first interaction:** browsers block audio until the first
  click/tap of a session. We unlock on the first pointer/key event
  (`primeNotificationAudio`).
- **Focus detection is per-device:** if the app is focused on a laptop, the
  laptop shows no banner, but the phone still gets a push (this is the
  WhatsApp behavior and is intentional).

## Production configuration checklist

Push is **silently disabled** when its env vars are missing — the code no-ops
rather than crashing. After any deploy or environment change verify:

1. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` are set (generate once
   with `npx web-push generate-vapid-keys`; see `.env.example`). Rotating the
   public key invalidates every existing subscription — devices re-subscribe
   automatically on next app open, but pushes are lost until then.
2. `NEXT_PUBLIC_APP_URL` points at the real origin (used in push payload links).
3. Centrifugo: `NEXT_PUBLIC_CENTRIFUGO_WS`, `CENTRIFUGO_HTTP_API`,
   `CENTRIFUGO_API_KEY`, `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` are set and match
   the Centrifugo server's own config. Note `centrifugo/config.json` ships with
   `allowed_origins: ["http://localhost:3000"]` — in production override it via
   `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS` (or edit the config) to the real app
   origin, otherwise browser WebSocket connections are rejected.
4. Admin → Settings → Member Notifications → Push health must show **no red/amber config alerts**, and
   Account → Notification diagnostics → "Send test notification" must deliver.

## When something "doesn't notify"

1. Ask the user to open **Account → Notification diagnostics** and read the
   red/amber rows.
2. Check **Admin → Settings → Member Notifications → Push health**: is the user in "no push device"?
   Did their sends fail (401/403 = VAPID mismatch, 404/410 = expired
   subscription — auto-cleaned)?
3. `PushDeliveryLog` has the full per-attempt history (status code, error,
   latency, endpoint host).
