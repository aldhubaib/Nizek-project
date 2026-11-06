import { describe, expect, it } from "vitest";

import { VIEWS } from "@/next-ui/panes/pane-kinds";
import { ADMIN_VIEW_TITLES, PROJECT_VIEW_TITLES } from "@/next-ui/panes/pane-registry";
import {
  ADMIN_ITEM,
  ADMIN_NAV,
  ADMIN_NAV_ITEMS,
  ALL_NAV_ITEMS,
  NAV,
  findAdminNav,
  findNav,
  isAdminPath,
  PROJECT_NAV,
  projectIdOf,
  projectNavHref,
  projectNavIsActive,
  visibleProjectNav,
} from "@/next-ui/shell/nav";

describe("the project menu", () => {
  it("lists the project's pages in the agreed order, each a known view with a title", () => {
    expect(PROJECT_NAV.map((i) => i.title)).toEqual(["About", "Road map", "Active sprint", "Kanban", "Assets", "Notes", "Team", "Vault", "Settings"]);
    for (const item of PROJECT_NAV.slice(1)) {
      expect(VIEWS.project).toContain(item.view);
      expect(PROJECT_VIEW_TITLES[item.view!]).toBe(item.title);
    }
    expect([...VIEWS.project].sort()).toEqual(PROJECT_NAV.flatMap((i) => (i.view ? [i.view] : [])).sort());
  });

  it("knows which project the page is in: the record, one of its views, a task or a note", () => {
    expect(projectIdOf("/next/projects/p1")).toBe("p1");
    expect(projectIdOf("/next/projects/p1/roadmap")).toBe("p1");
    expect(projectIdOf("/next/projects/p1/tasks/t9")).toBe("p1");
    expect(projectIdOf("/next/projects/p1/notes/n2")).toBe("p1");
    expect(projectIdOf("/next/projects")).toBeNull();
    expect(projectIdOf("/next/projects/new")).toBeNull();
    expect(projectIdOf("/next/equity/c1")).toBeNull();
    expect(projectIdOf("/dashboard/projects/p1")).toBeNull();
  });

  it("links each row to the view and lights the row for the page, a task lighting the road map", () => {
    const [about, roadmap, sprint, kanban, , notes] = PROJECT_NAV;
    expect(projectNavHref("p1", about)).toBe("/next/projects/p1");
    expect(projectNavHref("p1", roadmap)).toBe("/next/projects/p1/roadmap");
    expect(projectNavHref("p1", kanban)).toBe("/next/projects/p1/kanban");
    expect(projectNavIsActive("/next/projects/p1/kanban", "p1", kanban)).toBe(true);
    expect(projectNavIsActive("/next/projects/p1/kanban", "p1", roadmap)).toBe(false);
    expect(projectNavIsActive("/next/projects/p1", "p1", about)).toBe(true);
    expect(projectNavIsActive("/next/projects/p1", "p1", roadmap)).toBe(false);
    expect(projectNavIsActive("/next/projects/p1/sprint", "p1", sprint)).toBe(true);
    expect(projectNavIsActive("/next/projects/p1/tasks/t9", "p1", roadmap)).toBe(true);
    expect(projectNavIsActive("/next/projects/p1/notes/n2", "p1", notes)).toBe(true);
    expect(projectNavIsActive("/next/projects/p1/notes/n2", "p1", roadmap)).toBe(false);
    expect(projectNavIsActive("/next/projects/p2/roadmap", "p1", roadmap)).toBe(false);
  });

  it("hides the sprint pages for a project tracked without sprints, and shows Kanban only while its board is on", () => {
    const titles = (ways: Parameters<typeof visibleProjectNav>[0]) => visibleProjectNav(ways).map((i) => i.title);
    expect(titles({ sprintsEnabled: true, kanbanEnabled: true })).toHaveLength(9);
    expect(titles({ sprintsEnabled: true, kanbanEnabled: false })).toEqual(["About", "Road map", "Active sprint", "Assets", "Notes", "Team", "Vault", "Settings"]);
    expect(titles({ sprintsEnabled: false, kanbanEnabled: true })).toEqual(["About", "Kanban", "Assets", "Team", "Vault", "Settings"]);
    expect(titles({ sprintsEnabled: false, kanbanEnabled: false })).toEqual(["About", "Assets", "Team", "Vault", "Settings"]);
    // before the project is known: the usual rows, no Kanban, so the menu does not jump
    expect(titles(undefined)).toEqual(titles({ sprintsEnabled: true, kanbanEnabled: false }));
  });
});

describe("the Administrator menu", () => {
  it("holds every section of the live panel's Admin page, grouped, each a known view with a title", () => {
    expect(ADMIN_NAV.map((g) => g.label)).toEqual(["Team & roles", "Projects", "Access", "Appearance", "Monitoring"]);
    expect(ADMIN_NAV_ITEMS.map((i) => i.title)).toEqual([
      "Teams",
      "Members",
      "Role presets",
      "Client agreement",
      "Questions",
      "Contracts",
      "Equity access",
      "Vault access",
      "App logo",
      "Login page",
      "Notification sound",
      "Member notifications",
    ]);
    const views = ADMIN_NAV_ITEMS.map((i) => i.href.replace(`${ADMIN_ITEM.href}/`, ""));
    expect([...views].sort()).toEqual([...VIEWS.admin].sort());
    for (const [i, item] of ADMIN_NAV_ITEMS.entries()) {
      expect(ADMIN_VIEW_TITLES[views[i]]).toBe(item.title);
      expect(item.description).toBeTruthy();
    }
  });

  it("is not in the main list; the Administrator row stands for it in titles and breadcrumbs", () => {
    const main = NAV.flatMap((g) => g.items);
    expect(main.map((i) => i.title)).not.toContain("Admin");
    expect(main.map((i) => i.title)).not.toContain("Administrator");
    expect(ALL_NAV_ITEMS).toContain(ADMIN_ITEM);
    expect(ALL_NAV_ITEMS).not.toContain(ADMIN_NAV_ITEMS[0]);
    expect(findNav("/next/admin/teams")).toBe(ADMIN_ITEM);
    expect(findAdminNav("/next/admin/teams")?.title).toBe("Teams");
    expect(findAdminNav("/next/admin")).toBeUndefined();
  });

  it("knows the administrator's pages", () => {
    expect(isAdminPath("/next/admin")).toBe(true);
    expect(isAdminPath("/next/admin/roles")).toBe(true);
    expect(isAdminPath("/next/projects")).toBe(false);
    expect(isAdminPath("/next/administration")).toBe(false);
  });
});
