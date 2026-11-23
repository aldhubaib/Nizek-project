# Inbox & messages

Inbox displays project and direct-message threads at `/dashboard/messages` and opens individual conversations at `/dashboard/messages/<threadId>`.

## Sub-features

- `messages-inbox` loads the thread list at `/dashboard/messages`.
- `messages-thread` opens a conversation at `/dashboard/messages/<threadId>` with message history and composer.

## How to get to it (user POV)

- Click `Inbox` in the sidebar or bottom navigation.
- Visit `http://localhost:3001/dashboard/messages`.

## Driving it with cursor-ide-browser

Preconditions:

- `node .cursor/skills/verify-nizek/doctor.mjs` exits `0`.
- Browser is signed in (see [`sign-in.md`](./sign-in.md)).

- **Open inbox.** Call `browser_navigate` to `http://localhost:3001/dashboard/messages`, then `browser_snapshot`. The inbox thread list renders.
- **Open a thread.** Call `browser_click` on a thread row from the snapshot. URL changes to `/dashboard/messages/<threadId>`.
- **Verify thread view.** Call `browser_snapshot` and `browser_take_screenshot`. The thread header, message list, and message composer input are visible.

## Gotchas

- Realtime updates require Centrifugo (started automatically by `npm run local`); without it, page loads still work but live delivery won't fire.
- Avoid sending test messages into live/real threads unless you explicitly clean them up or are on a disposable local copy.
