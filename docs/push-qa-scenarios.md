# Push QA — scenarios and expected behaviour

Manual test matrix for the notification flow (gate, banner, push, chat
reliability). Run after any change under `src/lib/push/`,
`src/components/notification-*`, `public/sw*.js`, `src/lib/notify.ts`,
`src/lib/push-queue.ts`, `src/lib/message-events*.ts`, `src/lib/upload*.ts`,
`worker.ts`, or the push API.

Automated coverage that runs first, before anyone touches a phone:

| Command | What it proves |
| --- | --- |
| `npm test` | State machine for every scenario below (`tests/unit/push-state.test.ts`, `push-store.test.ts`), delivery outcomes + idempotency (`push-delivery.test.ts`), sw-lib payload/`pushsubscriptionchange` and the no-suppression rule (`sw-lib.test.ts`), API report parsing (`push-device-report.test.ts`), per-thread notification levels (`notification-prefs.test.ts`), message-event outbox ids/idempotency keys (`message-events-core.test.ts`), email digest rules (`email-digest-core.test.ts`), thread catch-up merge (`thread-changes.test.ts`), multipart upload maths (`upload-multipart-core.test.ts`), composer keys (`composer-keys.test.ts`). |
| `npm run test:e2e` | The real `sw.js` and the real `<NotificationGate>` in Chromium, Firefox, WebKit: default → dismissible banner (never the gate) whose "Not now" survives a reload, granted → never gated / no spinner / one status call, denied → gate with guidance and an enabled Check-again button, granted-but-lost-subscription → repaired silently (`tests/e2e/notification-gate.spec.ts`). |
| `npm run test:push-load` | 10k sends on one simulated worker replica ≥ 100 sends/s; 410 rows pruned, 403 rows `failCount++` and retired at 5, 500-then-ok delivered on retry. |

Where to look during manual tests:

- **Device:** Account → Notifications card (status + guidance) and the
  diagnostics panel (store snapshot, server subscription rows, last
  deliveries, "Send test").
- **Admin:** Settings → Member Notifications → Push health → click the user.
  Shows the `PushDevice` row (permission, view/reason, last seen) and the
  subscription rows with `failCount` / `lastFailureStatus`.

Reset between iOS scenarios: press-and-hold the Nizek icon → Remove App →
Delete. iOS forgets the permission for that install; leftover "Nizek" entries
in Settings → Notifications are harmless.

---

## S1 — Installed the PWA, removed it, installed again (iOS)

Precondition: device previously had a working install (received pushes).

| Step | Expected |
| --- | --- |
| 1. Delete the icon. | Nothing to observe on the phone. Server: the old subscription row still exists until APNs returns 410 (pruned on the next send) or the device re-registers with `oldEndpoint`. |
| 2. Open panel.nizek.com in **Safari**, Share → Add to Home Screen, open from the icon, sign in. | Gate view `pre-prompt`: "iPhone will ask once. Tap Allow…" with **Continue**. No spinner. |
| 3. Tap Continue → iOS prompt → **Allow**. | Gate disappears within ~2s. Account card shows **On**. Admin: new `PushDevice` row `permission=granted, enabled=true`, one `web.push.apple.com` subscription. |
| 4. Diagnostics → Send test. | OS banner arrives with the app backgrounded (lock the phone to be sure). Delivery log row `ok`. |
| 5. Repeat 1–2, but tap **Don't Allow** in step 3. | Gate view `denied`: "Notifications are blocked" with **Path 1** (Settings → Notifications → Nizek → Allow, force-quit, reopen, Check again) and **Path 2** (delete, reinstall from Safari). Button "I've done this — check again" is **enabled**, never spins forever. |
| 6. Follow Path 1, tap Check again. | Permission becomes `granted`; the store subscribes automatically → view `enabled`. If iOS refuses (happens on some builds), Path 2 always works. |
| 7. Admin, during step 5. | `PushDevice.permission = denied`, `lastReason = permission-denied`. This is the row that used to require a screenshot. |

Server-side companion (covered by unit tests, verify once in prod logs): a
send to the **old** endpoint from step 1 returns 410 → row deleted, log
`gone`. A 403 does **not** delete on first sight; it increments `failCount`.

## S2 — Fresh install

### S2a iOS, Safari tab (not installed)

| Step | Expected |
| --- | --- |
| Open panel.nizek.com in Safari, sign in. | Gate view `install`: "Install the app first" with Share → Add to Home Screen steps. **No** Enable button (a dead button was the old bug). |

### S2b iOS, Chrome / Firefox / in-app browser tab

| Step | Expected |
| --- | --- |
| Open panel.nizek.com in Chrome, sign in. | Gate view `safari-install`: "Open in Safari to install". No Enable button. |
| Chrome → Add to Home Screen → open the icon. | Still `safari-install` guidance (a Chrome-installed icon cannot receive push on iOS). Delete it and install from Safari. |

### S2c iOS, installed from Safari, first open

Same as S1 steps 2–4: `pre-prompt` → Continue → Allow → `enabled`.

### S2d Android (Chrome)

| Step | Expected |
| --- | --- |
| Open the site (tab or installed), sign in. | View `prompt`: a **top banner** "Turn on notifications" with **Enable notifications** and **Not now**. The app works underneath — no full-screen gate. |
| Tap Enable → Allow. | `enabled`, banner gone, Account card **On**. Send test → banner. |
| Tap Enable → Block. | `denied`: now the full-screen **gate** with Android steps (App info → Notifications). Check again enabled. |
| Dismiss the prompt without choosing. | View `prompt` again; banner shows "Permission wasn't granted — Try again" under "What happens next". |
| Tap **Not now**, reload, come back tomorrow. | Banner stays hidden for 7 days (`localStorage` `nizek-push-prompt-snoozed-until`), then returns. Account card still offers Enable at any time. |

### S2e Desktop (Chrome / Edge / Firefox / Safari 16+)

Same as Android with desktop wording ("lock icon → Notifications → Allow").
Safari desktop: `Notification.requestPermission` must come from the click;
the Enable button does this, the gate never auto-requests.

### S2f Granted but no subscription yet (e.g. browser data cleared)

| Step | Expected |
| --- | --- |
| Clear site data but keep the notification permission (Chrome: Site settings → Clear data). Reopen. | Never gated. View goes `verifying` → `repairing` → `enabled` with no user action; exactly one `POST /api/push`. Diagnostics show a fresh subscription id. |
| Make the server reject the POST (e.g. sign-out in another tab first). | View `repair-failed` with the concrete reason ("server returned HTTP 401") and **Try again**. Not an infinite spinner; the store retries on its own at most once per minute. |

## S3 — User has the old app and we deploy an update

Precondition: device on the previous build with working notifications.

| Step | Expected |
| --- | --- |
| 1. Deploy (worker first, then web; migration runs on boot). | Jobs already in Redis (v1 shape) still deliver. No gap. |
| 2. Device opens the app (foreground). | Update prompt appears (build stamp changed). Meanwhile: **never gated**; view `verifying` → `enabled` after one `GET /api/push/status`. No spinner in the Account card after the check completes. |
| 3. Reload to the new build. | New `sw.js` activates. Existing subscription reused (same endpoint) — `POST /api/push` is **not** called when the server already has it registered. |
| 4. Background the app, send a test from another account or the admin. | Banner arrives. Delivery log `ok`, `lastSuccessAt` updated, `failCount` stays 0. |
| 5. Rotate `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (staging only). Device opens the app. | Store detects the key mismatch, unsubscribes and re-subscribes, POSTs with `oldEndpoint` → old row gone, new row present, view `enabled` throughout. Sends to the old endpoint before that would have logged 403 and incremented `failCount`, never deleted before 5. |
| 6. Force a `pushsubscriptionchange` (Chrome: DevTools → Application → Service Workers → "Push" won't do it; simplest is to revoke and re-grant permission with the tab closed). | SW posts `{ endpoint, keys, oldEndpoint }`; server swaps the rows in one transaction. If the SW cannot resubscribe, it `DELETE`s the old endpoint. |
| 7. Admin during step 2. | `PushDevice.appBuild` updates to the new build id, `lastSeenAt` now. |

## Cross-cutting checks

| Check | Expected |
| --- | --- |
| Gate z-index / black screen | The app is always rendered underneath; the gate is an overlay. No black screen with the gate hidden. |
| Focused tab | No OS banner on the device that is actively reading the thread (in-app chime + bell instead); banner on every other device. Decided server-side by the worker from the `/api/presence/active` heartbeat — the service worker itself never suppresses (iOS drops silent pushes). |
| Admin impersonating a user | Account card shows "Not available while viewing as another user"; `POST /api/push` / `/device` answer `{ skipped: "impersonating" }` and write nothing under the user's id; never gated. |
| Redis down | Sending a message still succeeds for the user; `PushOutbox` row stays undispatched; Push health shows "Delivery service unreachable" and the undispatched count. Within 30s of Redis returning the worker sweep dispatches and banners arrive. |
| Worker down | Jobs accumulate (`waiting`), Push health "Delivery service not running". Restarting the worker drains them; nothing is lost or duplicated. |
| Two worker replicas | Same batch never delivered twice (deterministic `batchId:chunk` job ids). |
| 500 recipients in one notification | 10 jobs of 50; no single burst of 1,000 sockets; the worker metrics line shows the sends spread over the minute at ≤ 200 in flight per replica. |
| Development (`NODE_ENV !== production`) | Neither gate nor banner shows; Account card still shows real status. |

## Chat reliability (Phase 0)

Run on two accounts (A, B) and, where it says so, an admin. iPhone = installed PWA.

### C1 — iPhone banners while the app is closed

| Step | Expected |
| --- | --- |
| B locks the iPhone. A sends B a DM. | Banner on the lock screen every time (no silent pushes: `sw-lib` has no suppression hook). |
| B is reading that exact thread on the iPhone, A sends another DM. | **No** banner on the iPhone (the worker skipped it: `/api/presence/active` heartbeat), chime + bell instead; banner on B's other devices. |
| B is reading a different thread. | Banner arrives on the iPhone too. |

### C2 — Admin "view as" does not read for the user

| Step | Expected |
| --- | --- |
| Admin views as B, opens a DM with unread messages. | B's unread pill and badge stay; server logs `[read-state] view-as: skipped markThreadRead`; no `ChatReadCursor` write for B. |
| B opens the thread on their own device. | Clears as usual. |

### C3 — "Seen by" in groups

| Step | Expected |
| --- | --- |
| A sends in a 3-person group; only B opens it. | A sees **Seen by B** (not a bare "Seen"). After C opens it: **Seen by B, C**. |
| DM. | Plain "Seen" as before. |

### C4 — Enter behaviour

| Step | Expected |
| --- | --- |
| Desktop composer: Enter / Shift+Enter. | Enter sends, Shift+Enter inserts a new line. Same in the task comment box. |
| Phone: Enter. | New line (Send button sends). |
| Desktop with the @mention or task picker open: Enter. | Picks the item, does not send. |

### C5 — Long messages, voice notes, failed sends

| Step | Expected |
| --- | --- |
| Type past 18,000 characters. | Counter appears under the composer; at 20,000 it turns red and Send is blocked with a clear reason. The server refuses too (`Message is too long`). |
| Record a voice note and wait. | Stops by itself at 10 minutes and sends; note says it stopped at the limit. |
| Kill the network, send. | Message stays in the outbox with "Retrying"; a `[send-failure:client]` line is logged once it gives up; comes through when the network returns. |

### C6 — Large uploads (multipart, resumable)

| Step | Expected |
| --- | --- |
| iPhone on 4G, 300 MB video. | Progress climbs steadily; status text under the file ("part 7 of 19"). Completes; the video plays from R2. Admin R2 console shows no leftover multipart upload after the next daily cron. |
| Toggle Wi-Fi off/on mid-upload. | Pauses, then resumes from the next part — the percentage never drops to 0. |
| Kill the app at 50 %, reopen, pick the same file again. | Starts near 50 % ("Resuming…"), finished parts are skipped (IndexedDB resume keyed by name/size/mtime). |
| Pick a 3 GB file. | Refused up front: "Files up to 2GB". |
| Bucket CORS not yet set for this site (the state at the Phase 0 deploy). | 16–100 MB: status line "Direct upload blocked — using fallback route", file still arrives via the proxy. Over 100 MB: fails within seconds with "storage refused the browser upload … files over 100MB cannot be uploaded". Fix the bucket CORS (`docs/uploads.md`), no code change; then the same file uploads in parts. |
| CORS set but without `ExposeHeaders: ["ETag"]`. | First part uploads fully, then "did not expose its ETag"; same fallback as above. Add `ETag` to `ExposeHeaders`. |

### C7 — Messages never lost between devices (event outbox + catch-up)

| Step | Expected |
| --- | --- |
| Stop the worker. A sends 3 messages. | A sees them (own optimistic + DB); B gets nothing yet. Worker `/health` `messageEvents.backlog.pending = 3`; admin Push health shows "Events pending 3". Nothing is lost. |
| Start the worker. | Within 20 s B receives all 3 in order, exactly one notification each (no duplicates after a retry: `publishedAt` / `notifiedAt` stages). Backlog back to 0. |
| B's phone locked 10 minutes while A edits one message, deletes another, reacts to a third. | On unlock B's thread shows the edit, the deletion and the reaction without a manual refresh (`getThreadChangesSince` on reconnect/visibility). |
| B on the inbox list, backgrounded 10 min, A sends in two threads. | On return both previews and unread counts update without a full page reload; when nothing changed, nothing re-renders (`getInboxChangesSince` returns `threads: null`). |
| Restore a thread from the local cache that had a message deleted meanwhile. | The deleted message is gone on open (reconcile on mount). |

### C8 — Notification levels and email fallback

| Step | Expected |
| --- | --- |
| Project chat, defaults. | Only people @mentioned are notified (project and task threads default to **Mentions only**; DMs and groups default to **Every message**). A member who picks **Every message** from the thread menu then gets every message in that project; clients never do. |
| Thread menu → Notify me about → Off. | No in-app, push or email for that thread; still visible in the inbox. Switching back restores it. |
| A DMs B; B does not open it for 5 minutes. | B gets **one** email "1 new message in A" from `RESEND_FROM` with the line and an Open link. Worker logs `[worker] digest email sent`. |
| Same, but B opens the thread within 5 minutes (any device). | No email. |
| A sends 10 messages in 5 minutes. | Still one email, up to 5 lines + "…and 5 more". |

## Health after each weekly deploy

| Where | Expect |
| --- | --- |
| Worker `/health` | `messageEvents.backlog.pending` ~0 and `oldestAgeMs` < 5000 during the day; `emailDigests.queue.delayed` roughly equals DMs sent in the last 5 min; `failed` not growing. |
| Admin → Push health | "Events pending" 0–2, "Events stuck" 0; iOS `permission-denied` repairs per day trending to zero; delivery ok-rate from `PushDeliveryLog` ≥ 98 %. |
| Logs | `[send-failure]` lines per day; if they cluster on `bodyLength`, raise or explain the limit. `[worker] digest enqueue failed` should not appear. |
| Cron `/api/cron/deadline-reminders` response | `abortedUploads` small (stale multipart uploads cleaned), `prunedEvents` growing daily. |

## Regression list (bugs this design closes)

- Spinner that never stops on iOS PWA after Allow → replaced by `verifying` →
  `enabled` with a 30s check timeout and a view-driven gate.
- Enable button that does nothing on iOS tabs → `install` / `safari-install`
  views render steps and **no** button.
- Enable → Don't Allow leaves the user stuck → `denied` two-path recovery,
  Check-again always enabled.
- Overlapping runtimes racing `pushManager` → single serialized store.
- Registration unregistered on an 8s timeout while it still held the
  subscription → `registration.ts` never unregisters a registration with a
  subscription.
- Push silently dropped when Redis was unreachable → transactional outbox +
  worker sweep.
- 403/401 rows kept forever → `failCount`, retired at 5; 404/410 pruned at once.
- Diagnosis by screenshot → `PushDevice` row in Push health.
