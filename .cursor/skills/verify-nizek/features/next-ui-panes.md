# New frontend panes (`/next`)

The new frontend (`/next`) uses `PaneShell` with URL-backed main and side panes (`?pane=...`), context-switching sidebar lists, and keyboard shortcuts (`Option+Click` to open in side pane).

## Sub-features

- `next-shell` loads `/next` with the `.nx` theme and sidebar (`Dashboard`, `Inbox`, `Projects`, `Vault`, `Equity`, `Trash`).
- `next-project-sidebar` swaps the sidebar to the project menu when navigating into `/next/projects/<id>`.
- `next-side-pane` opens a second record in the side pane via `?pane=<kind>:<id>` and renders both panes side by side at `>= 1024px`.

## How to get to it (user POV)

- Click `New panel` in the live sidebar, or visit `http://localhost:3001/next`.
- Hover a record row and click `Open in pane`, or `Option+Click` a link to open it in the side pane.

## Driving it with cursor-ide-browser

Preconditions:

- `node .cursor/skills/verify-nizek/doctor.mjs` exits `0`.
- Browser is signed in (see [`sign-in.md`](./sign-in.md)) at a desktop viewport (`>= 1024px` wide).

- **Open `/next`.** Call `browser_navigate` to `http://localhost:3001/next`, then `browser_snapshot`. Sidebar links `Dashboard`, `Inbox`, `Projects` render with the dark `.nx` shell.
- **Navigate to Projects.** Call `browser_click` on `Projects` in the sidebar. URL updates to `/next/projects` without a full-page reload.
- **Open side pane.** From `/next/projects`, trigger `Open in pane` on a project row (or navigate to `/next/projects?pane=project:<id>`). Both the projects list and the project detail pane render side by side.
- **Proof.** Capture `browser_snapshot` and `browser_take_screenshot` showing both panes and the `?pane=` URL.

## Gotchas

- Below `1024px` width, the side pane renders as a sheet; below `768px`, as a bottom drawer.
- System admins also see the `Administrator` item at the bottom of the main sidebar (`/next/admin`).
- Never navigate from `/next` back to `/dashboard` inside `PaneShell` links; `/next` stays self-contained.
