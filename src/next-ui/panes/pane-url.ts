/**
 * The `?pane=` grammar (Social AI's panes brief, decision 6), pure functions only.
 *
 *   pane=<kind>[:<id>[:<view>]](,<kind>[:<id>[:<view>]])*,at:<n>
 *
 * The stack is listed newest first; `at` is the index of the visible side pane. Sections are
 * their path segment (`projects`); records are the singular with an id (`project:<id>`), and a
 * record with views adds the view (`project:<id>:roadmap`). A section may carry its own page
 * query as its id (`projects:status=late`); it is percent-encoded in the URL so `,` `:` `&`
 * inside it never collide with the grammar. A section with views of its own writes the view
 * third, with the query (often none) second: `admin::teams`.
 *
 * A pane's identity is its kind and id: the same record in another view is the same pane,
 * turned to another page (`sameEntry`, `entryKey`); only `sameView` tells the views apart.
 *
 * Paths are under `BASE` (`/next`) until the new UI is the default.
 */

export interface PaneEntry {
  kind: string;
  /** A record id, or for a section its page query (`status=late`) without the `?`. */
  id?: string;
  /** A record's view (`roadmap`), or a section's own page (`teams`); absent for the front page. */
  view?: string;
}

export interface PaneState {
  stack: PaneEntry[];
  at: number;
}

import { BASE, CHILD_RECORDS, HOME, ID_RE, RECORD_SECTION, SECTIONS, childId, isView, splitChildId } from "./pane-kinds";

export { BASE, HOME, SECTIONS, VIEWS, childId, isKnownKind, isView, sectionOf, splitChildId } from "./pane-kinds";

export const MAX_STACK = 8;
export const PANE_PARAM = "pane";

/** The id as written in the URL: section queries are encoded (twice: once survives the URL decode). */
const QUERY_TOKEN_RE = /^[A-Za-z0-9_.!~*'()%-]+$/;

/** The pane's identity (`project:<id>`), the same in every view; pins, recents and mounts key on it. */
export function entryKey(e: PaneEntry): string {
  return e.id ? `${e.kind}:${e.id}` : e.kind;
}

/** The identity and the view (`project:<id>:roadmap`): one scroll position per page shown. */
export function viewKey(e: PaneEntry): string {
  return e.view ? `${entryKey(e)}:${e.view}` : entryKey(e);
}

/**
 * React key for a mounted pane: a section keeps its mount while only its query (tab, filter)
 * changes, and a record keeps it while only its view changes.
 */
export function mountKey(e: PaneEntry): string {
  return e.kind in SECTIONS ? e.kind : entryKey(e);
}

function encodeId(e: PaneEntry): string {
  const view = e.view && isView(e.kind, e.view) ? e.view : undefined;
  if (!e.id) return view ? `${e.kind}::${view}` : e.kind;
  const id = e.kind in SECTIONS ? encodeURIComponent(e.id).replace(/%/g, "%25") : e.id;
  return view ? `${e.kind}:${id}:${view}` : `${e.kind}:${id}`;
}

/** The same pane: kind and id, whatever the view. */
export function sameEntry(a: PaneEntry, b: PaneEntry): boolean {
  return a.kind === b.kind && (a.id ?? "") === (b.id ?? "");
}

/** The same pane on the same page. */
export function sameView(a: PaneEntry, b: PaneEntry): boolean {
  return sameEntry(a, b) && (a.view ?? "") === (b.view ?? "");
}

function parseEntry(token: string): PaneEntry | null {
  const [kind, id, view, ...rest] = token.split(":");
  if (!kind || rest.length) return null;
  if (id === undefined) return kind in SECTIONS ? { kind } : null;
  if (view !== undefined && !isView(kind, view)) return null;
  if (kind in SECTIONS) {
    // a section's own page comes with an empty query slot: `admin::teams`
    if (id === "") return view ? { kind, view } : null;
    if (!QUERY_TOKEN_RE.test(id)) return null;
    try {
      return view ? { kind, id: decodeURIComponent(id), view } : { kind, id: decodeURIComponent(id) };
    } catch {
      return null;
    }
  }
  if (!(kind in RECORD_SECTION) || !ID_RE.test(id)) return null;
  return view ? { kind, id, view } : { kind, id };
}

/** Parse the query value; malformed input yields `null` (the page then shows no side pane). */
export function parsePane(value: string | null | undefined): PaneState | null {
  if (!value) return null;
  const tokens = value.split(",");
  const last = tokens.pop();
  if (!last || !last.startsWith("at:") || tokens.length === 0) return null;
  const at = Number(last.slice(3));
  if (!Number.isInteger(at) || at < 0) return null;
  const stack: PaneEntry[] = [];
  for (const t of tokens) {
    const e = parseEntry(t);
    if (!e) return null;
    if (!stack.some((s) => sameEntry(s, e))) stack.push(e);
  }
  if (!stack.length) return null;
  return { stack: stack.slice(0, MAX_STACK), at: Math.min(at, stack.length - 1) };
}

export function serializePane(state: PaneState | null): string | null {
  if (!state || !state.stack.length) return null;
  return [...state.stack.map(encodeId), `at:${state.at}`].join(",");
}

/** True for hrefs inside the new UI (`/next`, `/next/...`); the live panel and outside links are not. */
export function isAppHref(href: string): boolean {
  const path = href.split(/[?#]/)[0];
  return path === BASE || path === `${BASE}/` || path.startsWith(`${BASE}/`);
}

/** The path segments after `BASE`, or `null` when the path is outside the new UI. */
function appSegments(path: string): string[] | null {
  if (!isAppHref(path)) return null;
  return path.slice(BASE.length).split("/").filter(Boolean);
}

/** The page query of a section (`status=late`), without the pane param; "" when there is none. */
function pageQuery(query: string): string {
  const params = new URLSearchParams(query);
  params.delete(PANE_PARAM);
  return params.toString();
}

/**
 * `/next/projects` → `{kind: "projects"}`, `/next/projects/<id>` → `{kind: "project", id}`,
 * `/next/projects/<id>/roadmap` → `{kind: "project", id, view: "roadmap"}`,
 * `/next/admin/teams` → `{kind: "admin", view: "teams"}`,
 * `/next/projects?status=late` → `{kind: "projects", id: "status=late"}`, `/next/projects/new`
 * → `{kind: "project", id: "new"}`, `/next` → the dashboard; anything else (the live panel,
 * settings sub-pages, unknown paths) → `null`.
 */
export function entryFromHref(href: string): PaneEntry | null {
  const [pathAndQuery] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const parts = appSegments(path);
  if (!parts) return null;
  if (parts.length === 0) return { kind: HOME };
  if (parts.length === 1 && parts[0] in SECTIONS) {
    const q = pageQuery(query);
    return q ? { kind: parts[0], id: q } : { kind: parts[0] };
  }
  if (parts.length === 2) {
    const section = SECTIONS[parts[0]];
    const record = section?.record;
    if (record && (ID_RE.test(parts[1]) || parts[1] === "new")) return { kind: record, id: parts[1] };
    // a section without records: its own page, with the page's query if any
    if (section && !record && isView(parts[0], parts[1])) {
      const q = pageQuery(query);
      return q ? { kind: parts[0], id: q, view: parts[1] } : { kind: parts[0], view: parts[1] };
    }
  }
  // `/next/<section>/<id>/<view>` → the record, turned to one of its views
  if (parts.length === 3) {
    const record = SECTIONS[parts[0]]?.record;
    if (record && ID_RE.test(parts[1]) && isView(record, parts[2])) return { kind: record, id: parts[1], view: parts[2] };
  }
  // `/next/<section>/<id>/<segment>/<id>` → a child record with id `<id>_<id>`
  if (parts.length === 4) {
    const child = SECTIONS[parts[0]]?.children?.find((c) => c.segment === parts[2]);
    if (
      child &&
      ID_RE.test(parts[1]) &&
      ID_RE.test(parts[3]) &&
      !parts[1].includes("_") &&
      !parts[3].includes("_")
    ) {
      return { kind: child.record, id: childId(parts[1], parts[3]) };
    }
  }
  return null;
}

/**
 * The entry's path without `BASE` (`/projects/<id>`, `/projects/<id>/roadmap`, `/admin/teams`,
 * `/projects?status=late`), "/" for the dashboard.
 */
function pathOf(e: PaneEntry): string {
  const child = CHILD_RECORDS[e.kind];
  if (child && e.id) {
    const ids = splitChildId(e.id);
    return ids ? `/${child.section}/${ids.parent}/${child.segment}/${ids.child}` : `/${child.section}`;
  }
  if (e.kind === HOME) return "/";
  const section = e.kind in SECTIONS ? e.kind : RECORD_SECTION[e.kind];
  if (!section) return "/";
  const view = e.view && isView(e.kind, e.view) ? `/${e.view}` : "";
  if (e.kind in SECTIONS) return `/${section}${view}${e.id ? `?${e.id}` : ""}`;
  if (!e.id) return `/${section}`;
  return `/${section}/${e.id}${view}`;
}

export function hrefFromEntry(e: PaneEntry): string {
  const path = pathOf(e);
  return path === "/" ? BASE : `${BASE}${path}`;
}

/** The `pane` value in a search string (`?a=1&pane=…`), or `null`. */
export function paneParamOf(search: string): string | null {
  return new URLSearchParams(search.replace(/^\?/, "")).get(PANE_PARAM);
}

/**
 * `href` with its `pane` query set to `pane` (or removed when `null`); other params stay.
 * The pane value is appended raw — `:` and `,` are legal in a query and keep the URL readable.
 */
export function withPane(href: string, pane: string | null): string {
  const [pathAndQuery, hash] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  params.delete(PANE_PARAM);
  const parts = [params.toString(), pane ? `${PANE_PARAM}=${pane}` : ""].filter(Boolean);
  const q = parts.join("&");
  return `${path}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
}
