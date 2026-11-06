import {
  BellRing,
  FileText,
  FolderKanban,
  HelpCircle,
  Image as ImageIcon,
  Inbox,
  Info,
  IterationCcw,
  KeyRound,
  LayoutDashboard,
  LogIn,
  Map,
  Paperclip,
  PieChart,
  ScrollText,
  Settings,
  Shield,
  ShieldUser,
  SquareKanban,
  StickyNote,
  Trash,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import { CHILD_RECORDS, splitChildId } from "@/next-ui/panes/pane-kinds";
import { entryFromHref, hrefFromEntry } from "@/next-ui/panes/pane-url";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** One line on what the page holds; the Administrator index shows it under the title. */
  description?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Same destinations as the live panel, under /next until this UI is the default. */
export const NAV: NavGroup[] = [
  {
    items: [
      {
        title: "Dashboard",
        href: "/next",
        icon: LayoutDashboard,
      },
      {
        title: "Inbox",
        href: "/next/messages",
        icon: Inbox,
      },
      {
        title: "Projects",
        href: "/next/projects",
        icon: FolderKanban,
      },
    ],
  },
  {
    label: "Work",
    items: [
      {
        title: "Vault",
        href: "/next/vault",
        icon: KeyRound,
      },
      {
        title: "Equity",
        href: "/next/equity",
        icon: PieChart,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Trash",
        href: "/next/trash",
        icon: Trash,
      },
    ],
  },
];

/**
 * The Administrator row at the foot of the main list, for system admins only; it opens the
 * Administrator menu (Social AI's admin-menu pattern). Its page is the index of that menu.
 */
export const ADMIN_ITEM: NavItem = {
  title: "Administrator",
  href: "/next/admin",
  icon: ShieldUser,
};

const admin = (view: string) => `${ADMIN_ITEM.href}/${view}`;

/**
 * The Administrator menu: every section of the live panel's Admin page, grouped by what it is
 * about. Each row is one of the `admin` section's views (`pane-kinds.ts`).
 */
export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Team & roles",
    items: [
      { title: "Teams", href: admin("teams"), icon: FolderKanban, description: "Group members into teams and manage their access." },
      { title: "Members", href: admin("members"), icon: Users, description: "Invite people to the system and manage members." },
      {
        title: "Role presets",
        href: admin("roles"),
        icon: Shield,
        description: "The roles a new project starts with. Each project edits its own copy in its settings.",
      },
      {
        title: "Client agreement",
        href: admin("client-agreement"),
        icon: ScrollText,
        description: "The agreement clients accept before using their chat, its versions, and who has agreed.",
      },
    ],
  },
  {
    label: "Projects",
    items: [
      { title: "Questions", href: admin("questions"), icon: HelpCircle, description: "The default questions added to new tasks." },
      { title: "Contracts", href: admin("contracts"), icon: FileText, description: "Contract number prefixes." },
    ],
  },
  {
    label: "Access",
    items: [
      { title: "Equity access", href: admin("equity-access"), icon: PieChart, description: "Who can open the private Equity module." },
      { title: "Vault access", href: admin("vault-access"), icon: KeyRound, description: "Who can open each project's password vault." },
    ],
  },
  {
    label: "Appearance",
    items: [
      {
        title: "App logo",
        href: admin("app-logo"),
        icon: ImageIcon,
        description: "Favicon, app icons, web logo and the social share image.",
      },
      { title: "Login page", href: admin("login-page"), icon: LogIn, description: "The photos in the sign-in page's scrolling gallery." },
      {
        title: "Notification sound",
        href: admin("notification-sound"),
        icon: Volume2,
        description: "The sound people hear when a notification arrives.",
      },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        title: "Member notifications",
        href: admin("member-notifications"),
        icon: BellRing,
        description: "Who has notifications on or off, whether their last one was opened, and push delivery health.",
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: NavItem[] = ADMIN_NAV.flatMap((group) => group.items);

/** Every page the sidebar names, for titles and breadcrumbs; the Administrator row covers its menu's pages. */
export const ALL_NAV_ITEMS: NavItem[] = [...NAV.flatMap((group) => group.items), ADMIN_ITEM];

export function navIsActive(pathname: string, href: string): boolean {
  if (href === "/next") return pathname === "/next" || pathname === "/next/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findNav(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => navIsActive(pathname, item.href));
}

/** True inside the administrator's pages (`/next/admin`, `/next/admin/teams`). */
export function isAdminPath(pathname: string): boolean {
  return navIsActive(pathname, ADMIN_ITEM.href);
}

/** The Administrator menu row for a page, if the page is one of them. */
export function findAdminNav(pathname: string): NavItem | undefined {
  return ADMIN_NAV_ITEMS.find((item) => navIsActive(pathname, item.href));
}

/**
 * The project menu: what the sidebar shows instead of the main list while a project is open
 * in the main pane. Each row is one of the project's views (`pane-kinds.ts`); the first, with
 * no view, is the project itself.
 */
export interface ProjectNavItem {
  title: string;
  /** The record's view, or `undefined` for the record itself (About). */
  view?: string;
  icon: LucideIcon;
  /** Only for a project that runs sprints. */
  sprints?: boolean;
  /** Only for a project with its Kanban switched on. */
  kanban?: boolean;
  /** Child records (`tasks`, `notes`) that light this row when one is open. */
  children?: string[];
  /** Which count of the project the row shows after its name. */
  count?: "notes" | "assets" | "members";
}

export const PROJECT_NAV: ProjectNavItem[] = [
  { title: "About", icon: Info },
  { title: "Road map", view: "roadmap", icon: Map, sprints: true, children: ["tasks"] },
  { title: "Active sprint", view: "sprint", icon: IterationCcw, sprints: true },
  { title: "Kanban", view: "kanban", icon: SquareKanban, kanban: true },
  { title: "Assets", view: "assets", icon: Paperclip, count: "assets" },
  { title: "Notes", view: "notes", icon: StickyNote, sprints: true, children: ["notes"], count: "notes" },
  { title: "Team", view: "team", icon: Users, count: "members" },
  { title: "Vault", view: "vault", icon: KeyRound },
  { title: "Settings", view: "settings", icon: Settings },
];

/** The project the main pane is in (`/next/projects/<id>`, one of its views, a task or a note), or `null`. */
export function projectIdOf(pathname: string): string | null {
  const e = entryFromHref(pathname);
  if (!e?.id) return null;
  if (e.kind === "project") return e.id === "new" ? null : e.id;
  if (CHILD_RECORDS[e.kind]?.section === "projects") return splitChildId(e.id)?.parent ?? null;
  return null;
}

export function projectNavHref(projectId: string, item: ProjectNavItem): string {
  return hrefFromEntry({ kind: "project", id: projectId, view: item.view });
}

/** The row for the page: the view itself, or the row whose child record (a task, a note) is open. */
export function projectNavIsActive(pathname: string, projectId: string, item: ProjectNavItem): boolean {
  const e = entryFromHref(pathname);
  if (!e?.id) return false;
  if (e.kind === "project") return e.id === projectId && (e.view ?? "") === (item.view ?? "");
  const child = CHILD_RECORDS[e.kind];
  if (!child || child.section !== "projects") return false;
  return splitChildId(e.id)?.parent === projectId && !!item.children?.includes(child.segment);
}

/**
 * The rows a project shows: without the sprint rows for a project tracked another way, and
 * with Kanban only while its board is on. Nothing known yet (`undefined`) shows the sprint rows
 * and not the Kanban, the common case, so the menu does not jump once the project loads.
 */
export function visibleProjectNav(ways: { sprintsEnabled: boolean; kanbanEnabled: boolean } | undefined): ProjectNavItem[] {
  const sprints = ways?.sprintsEnabled ?? true;
  const kanban = ways?.kanbanEnabled ?? false;
  return PROJECT_NAV.filter((item) => (sprints || !item.sprints) && (kanban || !item.kanban));
}
