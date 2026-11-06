// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The two buttons every data page carries in its pane header — Filter and View — rendered on
 * the client with fake data: they land in the header slot, the Filter narrows the list and
 * fills in with what is chosen, the View switches cards and rows and is saved for next time.
 */

const now = new Date();
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

const PROJECTS = [
  {
    id: "p1",
    name: "Alpha Portal",
    description: "Customer portal rebuild",
    logoUrl: null,
    createdAt: new Date("2026-01-10T00:00:00Z"),
    sprintsEnabled: true,
    team: { id: "t1", name: "Web" },
    contracts: [{ id: "c1", label: "Phase 2", code: "NZK-002", contractType: "FULL_TEAM", startDate: inDays(-30), endDate: inDays(57), latePayment: false }],
    members: [],
    _count: { members: 4, tasks: 120, meetingNotes: 3, assets: 9 },
  },
  {
    id: "p2",
    name: "Beta App",
    description: null,
    logoUrl: null,
    createdAt: new Date("2025-03-01T00:00:00Z"),
    sprintsEnabled: true,
    team: { id: "t2", name: "Mobile" },
    contracts: [{ id: "c2", label: null, code: null, contractType: "MAINTENANCE", startDate: inDays(-400), endDate: inDays(-100), latePayment: false }],
    members: [],
    _count: { members: 1, tasks: 7, meetingNotes: 0, assets: 0 },
  },
];

const ASSETS = [
  { id: "a1", filename: "brief.pdf", url: "https://files.example/brief.pdf", fileSize: 2_400_000, mimeType: "application/pdf", createdAt: new Date("2026-02-02T00:00:00Z"), uploadedBy: { id: "u1", name: "Sara" } },
  { id: "a2", filename: "logo.png", url: "https://files.example/logo.png", fileSize: 40_000, mimeType: "image/png", createdAt: new Date("2026-02-03T00:00:00Z"), uploadedBy: { id: "u2", name: "Omar" } },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/next/projects",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/next-ui/data/projects", () => ({
  PROJECTS_KEY: ["projects"],
  projectKey: (id: string) => ["projects", id],
  useProjects: () => ({ data: PROJECTS, isPending: false, error: null }),
  useProject: () => ({ data: null, isPending: true, error: null }),
  useProjectLabel: () => "Alpha Portal",
  useProjectBrief: () => undefined,
  useProjectInvitations: () => ({ data: [], isPending: false, error: null }),
  useProjectRoles: () => ({ data: [], isPending: false, isError: false, error: null }),
}));

vi.mock("@/next-ui/data/team", () => ({
  TransferRequiredError: class TransferRequiredError extends Error {},
  useAvailableUsers: () => ({ data: [], isPending: false, error: null }),
  useAddMembers: () => ({ mutate: vi.fn(), isPending: false }),
  useInviteMember: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMemberRole: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelInvitation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/next-ui/data/tasks", () => ({
  projectTasksKey: (id: string) => ["projects", id, "tasks"],
  taskKey: (id: string) => ["tasks", id],
  useProjectTasks: () => ({ data: [], isPending: false, error: null }),
  useTask: () => ({ data: null, isPending: true, error: null }),
  useTaskLabel: () => undefined,
  useTaskCrumb: () => undefined,
  taskLabel: () => "",
}));

vi.mock("@/next-ui/data/notes", () => ({
  useProjectNotes: () => ({ data: [], isPending: false, error: null }),
  useNote: () => ({ data: null, isPending: true, error: null }),
  useNoteLabel: () => undefined,
}));

vi.mock("@/next-ui/data/assets", () => ({
  useAssets: () => ({ data: ASSETS, isPending: false, error: null }),
  useUploadAssets: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAsset: () => ({ mutate: vi.fn(), isPending: false }),
}));

type Filters = import("@/next-ui/patterns/filter-menu").PageFilters;
type View = import("@/next-ui/patterns/view-menu").PageViewState;

let root: Root | null = null;
let host: HTMLDivElement;
let slot: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.innerHTML = "";
  window.localStorage.clear();
});

/** Mounts a screen as a pane would: with a header slot for its actions and the tooltip provider. */
async function mount(page: string, node: React.ReactElement) {
  const { TooltipProvider } = await import("@/next-ui/ui/tooltip");
  const { PaneContext } = await import("@/next-ui/panes/use-pane");
  const { usePageFilters } = await import("@/next-ui/patterns/filter-menu");
  const { usePageView } = await import("@/next-ui/patterns/view-menu");
  const probe: { filters?: Filters; view?: View } = {};
  function Probe() {
    probe.filters = usePageFilters(page);
    probe.view = usePageView(page);
    return null;
  }
  host = document.createElement("div");
  slot = document.createElement("div");
  slot.setAttribute("data-pane-header-actions", "");
  document.body.append(slot, host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(
          PaneContext.Provider,
          { value: { side: false, entry: null, actions: slot, overflow: null, mode: "header" } },
          React.createElement(Probe),
          node,
        ),
      ),
    );
  });
  return probe as Required<typeof probe>;
}

const filterButton = () => slot.querySelector<HTMLButtonElement>('[data-testid="filter-menu"]');
const viewButton = () => slot.querySelector<HTMLButtonElement>('[data-testid="view-menu"]');
const titles = () => Array.from(host.querySelectorAll('[data-testid="record-row"], [data-testid="record-card"]')).map((el) => el.textContent ?? "");

describe("the Filter and View buttons of a data page", () => {
  it("puts search, Filter and View in the pane header, Filter off and the rows view by default", async () => {
    const { ProjectsScreen } = await import("@/next-ui/screens/projects/projects-screen");
    await mount("projects", React.createElement(ProjectsScreen));
    expect(slot.querySelector("[data-pane-header-search]")).not.toBeNull();
    expect(filterButton()?.dataset.filter).toBe("off");
    expect(filterButton()?.getAttribute("aria-label")).toBe("Filter projects");
    expect(viewButton()?.dataset.layout).toBe("rows");
    expect(host.querySelector('[data-testid="projects-list"]')?.getAttribute("data-layout")).toBe("rows");
    // the tools live in the header, not in the body
    expect(host.querySelector('[data-testid="filter-menu"]')).toBeNull();
    expect(host.querySelector('[data-testid="filter-bar"]')).toBeNull();
  });

  it("narrows the list from the Filter, fills the button in with the choice, and offers a way back", async () => {
    const { ProjectsScreen } = await import("@/next-ui/screens/projects/projects-screen");
    const probe = await mount("projects", React.createElement(ProjectsScreen));
    expect(titles()).toHaveLength(2);

    await act(async () => probe.filters.set("state", "archived"));
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain("Beta App");
    expect(filterButton()?.dataset.filter).toBe("on");
    expect(filterButton()?.textContent).toContain("Archived");
    expect(host.querySelector('[data-testid="collection-count"]')?.textContent).toBe("1 of 2 projects");

    // two groups narrow together: an archived project of the Web team does not exist
    await act(async () => probe.filters.set("team", "Web"));
    expect(titles()).toHaveLength(0);
    expect(filterButton()?.textContent).toContain("Archived · Web");
    const noMatch = host.querySelector('[data-testid="collection-no-match"]');
    expect(noMatch?.textContent).toContain("No projects match this filter");
    const showAll = noMatch?.querySelector("button");
    expect(showAll?.textContent).toBe("Show all projects");

    await act(async () => showAll!.click());
    expect(titles()).toHaveLength(2);
    expect(filterButton()?.dataset.filter).toBe("off");
  });

  it("opens as a menu of groups, All first and ticked, and a choice narrows the list and closes it", async () => {
    const { ProjectsScreen } = await import("@/next-ui/screens/projects/projects-screen");
    const probe = await mount("projects", React.createElement(ProjectsScreen));
    const button = filterButton()!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    });
    const menu = document.querySelector('[role="menu"][aria-label="Filter projects"]');
    expect(menu).not.toBeNull();
    const items = Array.from(menu!.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const labels = items.map((el) => el.textContent?.trim());
    // the standing first (no heading), then Team and Contract, each starting with All; the
    // archived project has no current contract, so only Full Team is offered
    expect(labels).toEqual(["All", "Active", "Archived", "All", "Mobile", "Web", "All", "Full Team"]);
    expect(menu!.textContent).toContain("Team");
    expect(menu!.textContent).toContain("Contract");
    expect(items.filter((el) => el.getAttribute("aria-checked") === "true")).toHaveLength(3);
    expect(items[0].getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      items[2].click();
    });
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain("Beta App");
    expect(document.querySelector('[role="menu"][aria-label="Filter projects"]')).toBeNull();
    expect(filterButton()?.textContent).toContain("Archived");
    await act(async () => probe.filters.clear());
  });

  it("keeps the filter for the session: the page comes back the way it was left", async () => {
    const { ProjectsScreen } = await import("@/next-ui/screens/projects/projects-screen");
    const probe = await mount("projects", React.createElement(ProjectsScreen));
    await act(async () => probe.filters.set("team", "Mobile"));
    await act(async () => root!.unmount());
    root = null;
    document.body.innerHTML = "";

    const again = await mount("projects", React.createElement(ProjectsScreen));
    expect(titles()).toHaveLength(1);
    expect(filterButton()?.textContent).toContain("Mobile");
    await act(async () => again.filters.clear());
  });

  it("switches to cards from the View, sizes them, and saves the choice for next time", async () => {
    const { ProjectsScreen } = await import("@/next-ui/screens/projects/projects-screen");
    const { viewStorageKey } = await import("@/next-ui/patterns/view-menu");
    const probe = await mount("projects", React.createElement(ProjectsScreen));
    expect(host.querySelectorAll('[data-testid="record-row"]')).toHaveLength(2);

    await act(async () => probe.view.setLayout("cards"));
    const list = host.querySelector<HTMLElement>('[data-testid="projects-list"]');
    expect(list?.dataset.layout).toBe("grid");
    expect(host.querySelectorAll('[data-testid="record-card"]')).toHaveLength(2);
    expect(host.querySelector('[data-testid="record-card"]')?.getAttribute("data-href")).toBe("/next/projects/p1");
    expect(viewButton()?.dataset.layout).toBe("cards");
    expect(list?.querySelector<HTMLElement>('[data-testid="collection-items"]')?.style.getPropertyValue("--min")).toBe("240px");

    await act(async () => probe.view.setLevel(4));
    expect(list?.querySelector<HTMLElement>('[data-testid="collection-items"]')?.style.getPropertyValue("--min")).toBe("380px");
    expect(JSON.parse(window.localStorage.getItem(viewStorageKey("projects")) ?? "{}")).toEqual({ layout: "cards", level: 4 });

    // a size chosen from the rows view brings the cards with it
    await act(async () => probe.view.setLayout("rows"));
    expect(list?.dataset.layout).toBe("rows");
    await act(async () => probe.view.setLevel(0));
    expect(list?.dataset.layout).toBe("grid");
    expect(viewButton()?.dataset.level).toBe("0");
  });

  it("puts the page's primary action in the header too, as an icon: Upload on the files page", async () => {
    const { AssetsView } = await import("@/next-ui/screens/projects/assets-view");
    const probe = await mount("assets:p1", React.createElement(AssetsView, { projectId: "p1", canUpload: true, canDelete: false }));
    const upload = slot.querySelector<HTMLElement>('[data-testid="upload-button"]');
    expect(upload?.querySelector("svg")).not.toBeNull();
    // the name is there for a screen reader and the tooltip, not on the button
    expect(upload?.textContent).toBe("Upload");
    expect(upload?.querySelector(".sr-only")?.textContent).toBe("Upload");
    expect(upload?.hasAttribute("data-pane-header-action")).toBe(true);
    expect(filterButton()?.dataset.filter).toBe("off");
    expect(titles()).toHaveLength(2);

    await act(async () => probe.filters.set("kind", "image"));
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain("logo.png");
    expect(filterButton()?.textContent).toContain("Images");
    await act(async () => probe.filters.clear());

    await act(async () => probe.filters.set("by", "Sara"));
    expect(titles()[0]).toContain("brief.pdf");
    await act(async () => probe.filters.clear());
  });

  it("gives the team page its Add people icon, for someone who may manage the team", async () => {
    const { TeamView } = await import("@/next-ui/screens/projects/team-view");
    const project = { ...PROJECTS[0], clientChatEnabled: false, updatedAt: new Date("2026-03-01T00:00:00Z") };
    const all = { canManageTeam: true, canInviteMembers: true, canInviteClients: true };
    await mount("team:p1", React.createElement(TeamView, { project: project as never, now: new Date("2026-03-01T12:00:00Z"), rights: all }));
    const add = slot.querySelector<HTMLElement>('[data-testid="add-people-button"]');
    expect(add?.querySelector("svg")).not.toBeNull();
    expect(add?.textContent).toBe("Add people");
    expect(add?.querySelector(".sr-only")?.textContent).toBe("Add people");
    // every action in the header is an icon
    for (const button of slot.querySelectorAll("button")) expect(button.textContent === "" || button.querySelector(".sr-only") !== null).toBe(true);
  });
});

describe("the helpers behind the menus", () => {
  it("sorts files into kinds by their media type", async () => {
    const { fileKind } = await import("@/next-ui/screens/projects/assets-view");
    expect(fileKind("image/png")).toBe("image");
    expect(fileKind("video/mp4")).toBe("video");
    expect(fileKind("audio/mpeg")).toBe("audio");
    expect(fileKind("application/pdf")).toBe("document");
    expect(fileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("document");
    expect(fileKind("text/csv")).toBe("document");
    expect(fileKind("application/zip")).toBe("archive");
    expect(fileKind("application/octet-stream")).toBe("other");
    expect(fileKind(null)).toBe("other");
  });

  it("lists the values present, in the given order or by name, and names what is chosen", async () => {
    const { optionsOf, chosenNames, ALL } = await import("@/next-ui/patterns/filter-menu");
    const rows = [{ k: "b" }, { k: "a" }, { k: "b" }, { k: null }];
    expect(optionsOf(rows, (r) => r.k).map((o) => o.value)).toEqual(["a", "b"]);
    expect(optionsOf(rows, (r) => r.k, (v) => ({ label: v.toUpperCase() }), ["b", "a", "z"]).map((o) => o.label)).toEqual(["B", "A"]);
    const groups = [
      { id: "x", value: "a", options: [{ value: "a", label: "Apples" }], onChange: () => {} },
      { id: "y", value: ALL, options: [{ value: "p", label: "Pears" }], onChange: () => {} },
      { id: "z", value: "gone", options: [{ value: "q", label: "Quinces" }], onChange: () => {} },
    ];
    expect(chosenNames(groups)).toEqual(["Apples"]);
  });
});
