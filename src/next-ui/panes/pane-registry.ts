import type { ReactNode } from "react";

import { useNoteLabel } from "@/next-ui/data/notes";
import { useProjectLabel } from "@/next-ui/data/projects";
import { useSprintLabel } from "@/next-ui/data/sprints";
import { useTaskCrumb, useTaskLabel } from "@/next-ui/data/tasks";

import { sectionOf, type PaneEntry } from "./pane-url";

/**
 * The kinds a pane can show: every section and its record. `pane-router.tsx` maps a kind to
 * its screen; this table only knows names. When a record screen is built, give its kind a
 * `useLabel` that reads the record's name from the same data the screen uses, so the
 * breadcrumb ("Projects › <name>") never adds a request of its own.
 */
export interface PaneKind {
  kind: string;
  title: string;
  /** Record kinds: the label of one record — the tray, the recents, the window title and (unless `useCrumb`) the breadcrumb. */
  useLabel?: (id: string) => string | undefined;
  /** A shorter name for the breadcrumb's crumb when the label is long (a task's `F-012`); the page shows the rest. */
  useCrumb?: (id: string) => string | undefined;
  /** A small mark after the label (a status dot); from the same cache as the label. */
  useMark?: (id: string) => ReactNode;
  /** The titles of the record's views (`pane-kinds.ts` names them), for the breadcrumb's last crumb. */
  views?: Record<string, string>;
}

/** The project's views as the sidebar and the breadcrumb name them; the record itself is "About". */
export const PROJECT_VIEW_TITLES: Record<string, string> = {
  roadmap: "Road map",
  sprint: "Active sprint",
  kanban: "Kanban",
  assets: "Assets",
  notes: "Notes",
  team: "Team",
  vault: "Vault",
  settings: "Settings",
};

/** The administrator's pages (the live panel's admin sections), as the Administrator menu names them. */
export const ADMIN_VIEW_TITLES: Record<string, string> = {
  teams: "Teams",
  members: "Members",
  roles: "Role presets",
  "client-agreement": "Client agreement",
  questions: "Questions",
  contracts: "Contracts",
  "equity-access": "Equity access",
  "vault-access": "Vault access",
  "app-logo": "App logo",
  "login-page": "Login page",
  "notification-sound": "Notification sound",
  "member-notifications": "Member notifications",
};

export const PANE_KINDS: Record<string, PaneKind> = {
  dashboard: { kind: "dashboard", title: "Dashboard" },
  messages: { kind: "messages", title: "Inbox" },
  thread: { kind: "thread", title: "Conversation" },
  projects: { kind: "projects", title: "Projects" },
  project: { kind: "project", title: "Project", useLabel: useProjectLabel, views: PROJECT_VIEW_TITLES },
  task: { kind: "task", title: "Task", useLabel: useTaskLabel, useCrumb: useTaskCrumb },
  note: { kind: "note", title: "Note", useLabel: useNoteLabel },
  sprint: { kind: "sprint", title: "Sprint", useLabel: useSprintLabel },
  vault: { kind: "vault", title: "Vault" },
  equity: { kind: "equity", title: "Equity" },
  portfolio: { kind: "portfolio", title: "Portfolio" },
  trash: { kind: "trash", title: "Trash" },
  admin: { kind: "admin", title: "Administrator", views: ADMIN_VIEW_TITLES },
};

/** True when the kind has a pane; other hrefs (the live panel, settings sub-pages) navigate the main pane. */
export function isPaneKind(kind: string): boolean {
  return kind in PANE_KINDS;
}

export function paneTitle(entry: PaneEntry): string {
  return PANE_KINDS[entry.kind]?.title ?? entry.kind;
}

/** The title of the entry's view ("Road map"), or `undefined` for the record itself. */
export function viewTitle(entry: PaneEntry): string | undefined {
  return entry.view ? (PANE_KINDS[entry.kind]?.views?.[entry.view] ?? entry.view) : undefined;
}

/** The section kind of an entry, when that section itself has a pane (`project` → `projects`). */
export function paneSection(entry: PaneEntry): PaneKind | undefined {
  const s = sectionOf(entry.kind);
  return s && s !== entry.kind ? PANE_KINDS[s] : undefined;
}
