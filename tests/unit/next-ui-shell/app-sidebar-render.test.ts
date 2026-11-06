// @vitest-environment jsdom
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The sidebar rendered once to HTML at three places: the project list (the main menu), a
 * project's road map (the project menu) and a task (the project menu, Road map lit).
 */

let pathname = "/next/projects";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

let kanbanEnabled = false;
vi.mock("@/next-ui/data/projects", () => ({
  PROJECTS_KEY: ["projects"],
  projectKey: (id: string) => ["projects", id],
  useProjectLabel: () => "Hazawy",
  useProjectBrief: (id: string) =>
    id === "p1" ? { name: "Hazawy", logoUrl: null, sprintsEnabled: true, kanbanEnabled, counts: { notes: 10, assets: 0, members: 12 } } : undefined,
}));

async function render(role = "ADMIN"): Promise<string> {
  const { TooltipProvider } = await import("@/next-ui/ui/tooltip");
  const { SidebarProvider } = await import("@/next-ui/ui/sidebar");
  const { ViewerProvider } = await import("@/next-ui/lib/viewer");
  const { AppSidebar } = await import("@/next-ui/shell/app-sidebar");
  const viewer = { id: "u1", name: "Abdulaziz", email: "a@nizek.com", systemRole: role };
  return renderToString(
    React.createElement(
      TooltipProvider,
      null,
      React.createElement(
        ViewerProvider,
        { viewer },
        React.createElement(SidebarProvider, null, React.createElement(AppSidebar, { userName: "Abdulaziz", userEmail: "a@nizek.com" })),
      ),
    ),
  );
}

const MAIN = ["Dashboard", "Inbox", "Projects", "Vault", "Equity", "Trash"];
const PROJECT = ["About", "Road map", "Active sprint", "Assets", "Notes", "Team", "Vault", "Settings"];
const ADMIN = ["Teams", "Members", "Role presets", "Client agreement", "Questions", "Contracts", "Vault access", "App logo", "Member notifications"];

describe("the sidebar", () => {
  it("shows the main menu on the project list, with the Administrator row at the foot for an admin", async () => {
    pathname = "/next/projects";
    const html = await render();
    for (const item of MAIN) expect(html).toContain(`<span>${item}</span>`);
    expect(html).not.toContain("<span>Admin</span>");
    expect(html).toContain('data-testid="nav-admin"');
    expect(html).toContain('href="/next/admin"');
    expect(html).not.toContain('data-testid="nav-back"');
    expect(html).not.toContain('data-testid="nav-project"');
    expect(html).toContain('data-view="main"');
    for (const item of ADMIN) expect(html).not.toContain(`<span>${item}</span>`);
  });

  it("shows no Administrator row to a non-admin, even on an admin page", async () => {
    pathname = "/next/admin/teams";
    const html = await render("DEVELOPER");
    expect(html).toContain('data-view="main"');
    expect(html).not.toContain('data-testid="nav-admin"');
    expect(html).not.toContain('data-testid="nav-back"');
    for (const item of MAIN) expect(html).toContain(`<span>${item}</span>`);
  });

  it("swaps to the Administrator menu on an admin page: the back row, then the grouped pages", async () => {
    pathname = "/next/admin/roles";
    const html = await render();
    expect(html).toContain('data-view="admin"');
    expect(html).toContain('data-testid="nav-back"');
    for (const item of ADMIN) expect(html).toContain(`<span>${item}</span>`);
    for (const label of ["Team &amp; roles", "Projects", "Access", "Appearance", "Monitoring"]) expect(html).toContain(label);
    for (const item of ["Dashboard", "Inbox", "Equity"]) expect(html).not.toContain(`<span>${item}</span>`);
    expect(html).toMatch(/data-active="true"[^>]*href="\/next\/admin\/roles"/);
    expect(html).not.toMatch(/data-active="true"[^>]*href="\/next\/admin\/teams"/);
  });

  it("swaps to the project menu inside a project: the project's row with a back arrow, then its pages", async () => {
    pathname = "/next/projects/p1/roadmap";
    const html = await render();
    expect(html).toContain('data-view="project"');
    expect(html).toContain('data-testid="nav-back"');
    expect(html).toContain("Hazawy");
    for (const item of PROJECT) expect(html).toContain(`<span>${item}</span>`);
    for (const item of ["Dashboard", "Inbox", "Equity"]) expect(html).not.toContain(`<span>${item}</span>`);
    // each row links to the project's page; the one for this page is lit
    expect(html).toContain('href="/next/projects/p1"');
    expect(html).toContain('href="/next/projects/p1/sprint"');
    expect(html).toContain('href="/next/projects/p1/settings"');
    expect(html).toMatch(/data-active="true"[^>]*href="\/next\/projects\/p1\/roadmap"/);
    expect(html).not.toMatch(/data-active="true"[^>]*href="\/next\/projects\/p1\/sprint"/);
    // the counts after Notes and Team; none for Assets, which has nothing
    expect(html).toContain(">10<");
    expect(html).toContain(">12<");
    // no Kanban row while the project's board is off
    expect(html).not.toContain("<span>Kanban</span>");
  });

  it("adds the Kanban row, between Active sprint and Assets, once the project's board is on", async () => {
    pathname = "/next/projects/p1/kanban";
    kanbanEnabled = true;
    try {
      const html = await render();
      expect(html).toContain("<span>Kanban</span>");
      expect(html).toMatch(/data-active="true"[^>]*href="\/next\/projects\/p1\/kanban"/);
      const at = (item: string) => html.indexOf(`<span>${item}</span>`);
      expect(at("Active sprint")).toBeLessThan(at("Kanban"));
      expect(at("Kanban")).toBeLessThan(at("Assets"));
    } finally {
      kanbanEnabled = false;
    }
  });

  it("lights Road map for a task of the project", async () => {
    pathname = "/next/projects/p1/tasks/t9";
    const html = await render();
    expect(html).toContain('data-view="project"');
    expect(html).toMatch(/data-active="true"[^>]*href="\/next\/projects\/p1\/roadmap"/);
    expect(html).not.toMatch(/data-active="true"[^>]*href="\/next\/projects\/p1"/);
  });
});
