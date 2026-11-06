/**
 * The pane kinds (Social AI's docs/panes-brief.md, decision 6, ported): every section by its
 * path segment and the record kind each section opens. Pure data and lookups, nothing else.
 */

/** Where the new UI lives until it becomes the default; then this becomes "" and nothing else moves. */
export const BASE = "/next";

/** The front door: `/next` itself is the dashboard. */
export const HOME = "dashboard";

export interface SectionDef {
  record?: string;
  /**
   * Views: the pages of the section's record (`/projects/<id>/roadmap`), or of the section
   * itself when it has no records (`/admin/teams`), one path segment each, chosen from a
   * sidebar menu. The record or section without a view is its front page.
   */
  views?: readonly string[];
  /** Child records under the record (`/projects/<id>/tasks/<id>` → `task`); pane id `<id>_<id>`. */
  children?: { segment: string; record: string }[];
}

/**
 * Section kinds, keyed by their path segment, and the record kind each one opens. A section may
 * also have child records under its record (`/projects/<id>/tasks/<id>` → `task`), whose pane
 * id is the two ids joined by `_`.
 */
export const SECTIONS: Record<string, SectionDef> = {
  dashboard: {},
  messages: { record: "thread" },
  projects: {
    record: "project",
    views: ["roadmap", "sprint", "kanban", "assets", "notes", "team", "vault", "settings"],
    children: [
      { segment: "tasks", record: "task" },
      { segment: "notes", record: "note" },
      // a sprint's document: its plan, then its review (`/projects/<id>/sprints/<id>`)
      { segment: "sprints", record: "sprint" },
    ],
  },
  vault: {},
  equity: { record: "portfolio" },
  trash: {},
  admin: {
    views: [
      "teams",
      "members",
      "roles",
      "client-agreement",
      "questions",
      "contracts",
      "equity-access",
      "vault-access",
      "app-logo",
      "login-page",
      "notification-sound",
      "member-notifications",
    ],
  },
};

export const RECORD_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SECTIONS).flatMap(([s, v]) => [
    ...(v.record ? [[v.record, s]] : []),
    ...(v.children ?? []).map((c) => [c.record, s]),
  ]),
);

/** Child record kinds: the section and path segment they live under. */
export const CHILD_RECORDS: Record<string, { section: string; segment: string }> = Object.fromEntries(
  Object.entries(SECTIONS).flatMap(([s, v]) =>
    (v.children ?? []).map((c) => [c.record, { section: s, segment: c.segment }]),
  ),
);

/**
 * The views by the kind that carries them: a section's record (`project` → roadmap, sprint, …)
 * or, for a section without records, the section itself (`admin` → teams, members, …).
 */
export const VIEWS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(SECTIONS).flatMap(([s, v]) => (v.views ? [[v.record ?? s, v.views]] : [])),
);

export function isView(kind: string, view: string): boolean {
  return VIEWS[kind]?.includes(view) ?? false;
}

/** What a record id may look like in a path or a `?pane=` token. */
export const ID_RE = /^[A-Za-z0-9_-]+$/;

/** A child record's pane id is `<parent>_<child>`; the parts themselves never contain `_`. */
export const childId = (parent: string, child: string) => `${parent}_${child}`;
export function splitChildId(id: string): { parent: string; child: string } | null {
  const i = id.indexOf("_");
  if (i <= 0 || i === id.length - 1 || id.indexOf("_", i + 1) !== -1) return null;
  return { parent: id.slice(0, i), child: id.slice(i + 1) };
}

export function isKnownKind(kind: string): boolean {
  return kind in SECTIONS || kind in RECORD_SECTION;
}

/** The section a kind belongs to: `project` → `projects`, `projects` → `projects`. */
export function sectionOf(kind: string): string | undefined {
  return kind in SECTIONS ? kind : RECORD_SECTION[kind];
}
