# Projects

Projects lets signed-in team members browse projects and open a project's workspace on both the live panel (`/dashboard/projects`) and the new frontend (`/next/projects`).

## Sub-features

- `projects-live-list` renders the project list at `/dashboard/projects`.
- `projects-live-detail` opens a project at `/dashboard/projects/<id>`.
- `projects-next-list` renders the project collection at `/next/projects`.
- `projects-next-detail` opens a project at `/next/projects/<id>` and switches the sidebar to the project menu.

## How to get to it (user POV)

- Click `Projects` in the sidebar (or bottom nav on mobile) from `/dashboard`.
- Visit `http://localhost:3001/dashboard/projects` or `http://localhost:3001/next/projects`.

## Driving it with cursor-ide-browser

Preconditions:

- `node .cursor/skills/verify-nizek/doctor.mjs` exits `0`.
- Browser is signed in (see [`sign-in.md`](./sign-in.md)) as a non-client team member with access to at least one project.

- **Open live projects list.** Call `browser_navigate` to `http://localhost:3001/dashboard/projects`, then `browser_snapshot`. Project cards or rows render.
- **Open a project (live).** Call `browser_click` on a project link from the snapshot. URL changes to `/dashboard/projects/<projectId>`. Call `browser_snapshot` and `browser_take_screenshot` to confirm the project header and tabs load without errors.
- **Open new-UI projects list.** Call `browser_navigate` to `http://localhost:3001/next/projects`, then `browser_snapshot`. The filter bar and project rows render.
- **Open a project (new UI).** Call `browser_click` on a project row. URL changes to `/next/projects/<projectId>` and the sidebar switches to the project menu (`About`, `Road map`, `Active sprint`, etc.). Capture `browser_take_screenshot`.

## Gotchas

- Client accounts are redirected away from `/dashboard/projects` to `/dashboard/messages` by `ClientRouteGuard`.
- If the local DB has zero projects, seed or pull data (`npm run local:data`) before verifying detail views.
- Switching between `/dashboard` and `/next` uses a full page load by design so `.nx` theme styles mount cleanly.
