// @vitest-environment jsdom
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The project screens, rendered once to HTML with fake data: a smoke test that the blocks,
 * the pane hooks and the data shapes fit together (the type checker cannot see a Radix slot or
 * a `Collection` prop that renders nothing).
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
    contracts: [
      { id: "c1", label: "Phase 2", code: "NZK-002", contractType: "FULL_TEAM", startDate: inDays(-30), endDate: inDays(57), latePayment: false },
    ],
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
    team: null,
    contracts: [{ id: "c2", label: null, code: null, contractType: "MAINTENANCE", startDate: inDays(-400), endDate: inDays(-100), latePayment: false }],
    members: [],
    _count: { members: 1, tasks: 7, meetingNotes: 0, assets: 0 },
  },
];

const DETAIL = {
  ...PROJECTS[0],
  team: { id: "t1", name: "Web" },
  clientChatEnabled: false,
  maxPipelineTasks: 3,
  internalReviewRoleId: "r1",
  internalReviewUserId: null,
  updatedAt: new Date("2026-03-01T00:00:00Z"),
  members: [
    {
      id: "m1",
      role: "MEMBER",
      canInviteMembers: true,
      canInviteClients: false,
      canBypassProof: false,
      createdAt: new Date("2026-01-12T00:00:00Z"),
      projectRole: { id: "r1", name: "Developer" },
      user: { id: "u1", name: "Sara", email: "sara@nizek.com", imageUrl: null },
    },
    {
      id: "m2",
      role: "ADMIN",
      canInviteMembers: true,
      canInviteClients: true,
      canBypassProof: false,
      createdAt: new Date("2026-01-10T00:00:00Z"),
      projectRole: null,
      user: { id: "u2", name: "Omar", email: "omar@nizek.com", imageUrl: null },
    },
  ],
};

const INVITATIONS = [
  {
    id: "i1",
    email: "new@client.com",
    name: "Lina",
    role: "CLIENT",
    status: "PENDING",
    projectId: "p1",
    createdAt: new Date("2026-02-20T00:00:00Z"),
    expiresAt: new Date(now.getTime() + 5 * 86_400_000),
    invitedBy: { id: "u2", name: "Omar", imageUrl: null },
    projectRole: null,
  },
];

const VAULT = [
  {
    id: "v1",
    projectId: "p1",
    projectName: "Alpha Portal",
    folderId: "f1",
    folderName: "Production",
    title: "Admin console",
    username: "ops@nizek.com",
    hasPassword: true,
    url: "https://admin.alpha.example/login",
    hasNotes: false,
    category: "LOGIN",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
    createdBy: { id: "u2", name: "Omar", imageUrl: null },
  },
];

const person = { id: "u1", name: "Sara", imageUrl: null };
const task = (over: Record<string, unknown>) => ({
  id: "t",
  taskNumber: 1,
  title: "Task",
  description: null,
  priority: "NORMAL",
  taskType: "FEATURE",
  stage: "BACKLOG",
  order: 0,
  assignee: person,
  createdBy: person,
  isReadyForTransition: true,
  sprintId: null,
  ...over,
});

const TASKS = [
  task({ id: "t1", taskNumber: 491, title: "Research the DSP integration", order: 1 }),
  task({ id: "t2", taskNumber: 17, title: "Market place MVP", order: 2, isReadyForTransition: false }),
  task({ id: "t3", taskNumber: 412, title: "APK support for kiosks", taskType: "BUG", stage: "PLANNED", sprintId: "s-planned", sprintCount: 2 }),
  task({ id: "t4", taskNumber: 5, title: "Fix login", taskType: "BUG", stage: "IN_DEVELOPMENT", sprintId: "s-active", estimatedMinutes: 90 }),
  task({ id: "t5", taskNumber: 6, title: "Ship onboarding", stage: "DONE", sprintId: "s-active" }),
];

const sprint = (over: Record<string, unknown>) => ({
  id: "s",
  name: "Sprint",
  goal: null,
  startDate: inDays(-7),
  endDate: inDays(7),
  status: "PLANNED",
  incompleteReason: null,
  completedAt: null,
  reviewDate: null,
  sortOrder: 0,
  projectId: "p1",
  createdAt: inDays(-10),
  updatedAt: inDays(-1),
  taskCount: 1,
  ...over,
});

const SPRINTS = [
  sprint({ id: "s-active", name: "Sprint 12", status: "ACTIVE", taskCount: 2 }),
  sprint({ id: "s-planned", name: "Sprint 13", status: "PLANNED", startDate: inDays(8), endDate: inDays(21) }),
  sprint({ id: "s-done", name: "Sprint 11", status: "COMPLETED", startDate: inDays(-21), endDate: inDays(-8), completedAt: inDays(-8), taskCount: 0 }),
];

const NOTES = [
  {
    id: "n1",
    title: "Kickoff meeting",
    content: "<p>We agreed on the <b>scope</b>.</p>",
    date: new Date("2026-02-01T00:00:00Z"),
    noteType: "MEETING_NOTE",
    dueDate: null,
    completedAt: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-01T00:00:00Z"),
    projectId: "p1",
    author: { id: "u1", name: "Sara", imageUrl: null },
    task: null,
    taskLinks: [],
    commentThreads: [{ id: "th1" }],
  },
];

const ASSETS = [
  {
    id: "a1",
    filename: "brief.pdf",
    url: "https://files.example/brief.pdf",
    fileSize: 2_400_000,
    mimeType: "application/pdf",
    createdAt: new Date("2026-02-02T00:00:00Z"),
    uploadedBy: { id: "u1", name: "Sara" },
  },
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
  useProject: () => ({ data: DETAIL, isPending: false, error: null }),
  useProjectLabel: () => "Alpha Portal",
  useProjectBrief: () => ({ name: "Alpha Portal", logoUrl: null, sprintsEnabled: true, counts: { notes: 3, assets: 9, members: 2 } }),
  useProjectInvitations: () => ({ data: INVITATIONS, isPending: false, error: null }),
}));

vi.mock("@/next-ui/data/vault", () => ({
  useProjectVault: () => ({ data: VAULT, isPending: false, error: null }),
}));

vi.mock("@/next-ui/data/tasks", () => ({
  projectTasksKey: (id: string) => ["projects", id, "tasks"],
  taskKey: (id: string) => ["tasks", id],
  useProjectTasks: () => ({ data: TASKS, isPending: false, error: null }),
  useTask: () => ({ data: null, isPending: true, error: null }),
  useTaskLabel: () => undefined,
  taskLabel: () => "",
}));

vi.mock("@/next-ui/data/sprints", () => ({
  useSprints: () => ({ data: SPRINTS, isPending: false, error: null }),
  useSprintSnapshots: () => ({ data: undefined }),
}));

vi.mock("@/next-ui/data/notes", () => ({
  useProjectNotes: () => ({ data: NOTES, isPending: false, error: null }),
  useNote: () => ({ data: NOTES[0], isPending: false, error: null }),
  useNoteLabel: () => "Kickoff meeting",
}));

vi.mock("@/next-ui/data/assets", () => ({
  useAssets: () => ({ data: ASSETS, isPending: false, error: null }),
  useUploadAssets: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAsset: () => ({ mutate: vi.fn(), isPending: false }),
}));

async function render(node: React.ReactElement): Promise<string> {
  const { TooltipProvider } = await import("@/next-ui/ui/tooltip");
  return renderToString(React.createElement(TooltipProvider, null, node));
}

describe("the project screens", () => {
  it("lists projects as rows with their standing, team and size", async () => {
    const { ProjectsScreen } = await import("@/next-ui/screens/projects/projects-screen");
    const html = await render(React.createElement(ProjectsScreen));
    expect(html).toContain("Alpha Portal");
    expect(html).toContain("Beta App");
    // the contract ends 57 days from now at this time of day, so 57 or 58 whole days to the end of that day
    expect(html).toMatch(/5[78] days left/);
    expect(html).toContain("Archived");
    expect(html).toContain("Full Team");
    expect(html).toContain("2 projects");
    expect(html).toContain('data-href="/next/projects/p1"');
  });

  it("opens a project on its About: the header card and the contracts, no tabs", async () => {
    const { ProjectScreen } = await import("@/next-ui/screens/projects/project-screen");
    const html = await render(React.createElement(ProjectScreen, { id: "p1" }));
    expect(html).toContain('data-testid="header-card"');
    expect(html).toContain("Alpha Portal");
    // the header card's status line: contract · dates · days left
    expect(html).toMatch(/Phase 2[^]*5[78] days left/);
    expect(html).toContain("NZK-002");
    // the views are the sidebar's menu now, not tabs in the page
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('data-testid="lane-board"');
    // nothing in the new UI points at the old panel
    expect(html).not.toContain("/dashboard");
    expect(html).not.toContain("current panel");
  });

  it("turns the project to its road map: the lanes and the tasks in them", async () => {
    const { ProjectScreen } = await import("@/next-ui/screens/projects/project-screen");
    const html = await render(React.createElement(ProjectScreen, { id: "p1", view: "roadmap" }));
    expect(html).not.toContain('data-testid="header-card"');
    expect(html).toContain('data-testid="lane-board"');
    for (const lane of ["Missing data", "Backlog", "Planned", "Next", "In progress", "Completed", "Shipped"]) expect(html).toContain(lane);
    expect(html).toContain("Research the DSP integration");
    expect(html).toContain("F-491");
    expect(html).toContain("B-412");
    expect(html).toContain("2x");
    expect(html).toContain("Sprint 12");
    expect(html).toContain("Sprint 11");
    // a done task is not a loose row and the missing-data flag marks the unanswered one
    expect(html).toContain('aria-label="Missing data"');
    // a task opens as its own pane under the project
    expect(html).toContain('data-href="/next/projects/p1/tasks/t1"');
    // a page the project does not have
    const none = await render(React.createElement(ProjectScreen, { id: "p1", view: "board" }));
    expect(none).toContain("No such page");
  });

  it("shows the active sprint by stage", async () => {
    const { ActiveSprintView: ActiveSprintTab } = await import("@/next-ui/screens/projects/active-sprint-view");
    const html = await render(React.createElement(ActiveSprintTab, { projectId: "p1" }));
    expect(html).toContain("Sprint 12");
    expect(html).toContain("1 of 2 done");
    for (const stage of ["Todo", "In Development", "Internal Review", "Done"]) expect(html).toContain(stage);
    expect(html).toContain("Fix login");
    expect(html).toContain("1h 30m");
    expect(html).toContain("Ship onboarding");
    expect(html).not.toContain("Market place MVP");
  });

  it("lists notes and files as rows", async () => {
    const { NotesView } = await import("@/next-ui/screens/projects/notes-view");
    const notes = await render(React.createElement(NotesView, { projectId: "p1" }));
    expect(notes).toContain("Kickoff meeting");
    expect(notes).toContain("We agreed on the scope.");
    expect(notes).toContain("Meeting note");
    expect(notes).toContain('data-href="/next/projects/p1/notes/n1"');

    const { AssetsView } = await import("@/next-ui/screens/projects/assets-view");
    const files = await render(React.createElement(AssetsView, { projectId: "p1", canUpload: true, canDelete: false }));
    expect(files).toContain("brief.pdf");
    expect(files).toContain("2.3 MB");
    expect(files).toContain("Upload");
    expect(files).toContain("1 file");
  });

  it("shows the team: members by role, then who is invited", async () => {
    const { TeamView } = await import("@/next-ui/screens/projects/team-view");
    const html = await render(React.createElement(TeamView, { project: DETAIL as never, now }));
    // the admin comes before the developer
    expect(html.indexOf("Omar")).toBeLessThan(html.indexOf("Sara"));
    expect(html).toContain("Developer");
    expect(html).toContain("Can invite");
    expect(html).toContain("Can invite clients");
    expect(html).toContain("Lina");
    expect(html).toContain("new@client.com");
    expect(html).toContain("Expires");
  });

  it("shows the vault without secrets, and the settings as facts", async () => {
    const { VaultView } = await import("@/next-ui/screens/projects/vault-view");
    const vault = await render(React.createElement(VaultView, { projectId: "p1" }));
    expect(vault).toContain("Admin console");
    expect(vault).toContain("ops@nizek.com");
    expect(vault).toContain("admin.alpha.example");
    expect(vault).toContain("Production");
    expect(vault).toContain("Password");
    expect(vault).toContain("1 entry");

    const { SettingsView } = await import("@/next-ui/screens/projects/settings-view");
    const settings = await render(React.createElement(SettingsView, { project: DETAIL as never }));
    expect(settings).toContain("Customer portal rebuild");
    expect(settings).toContain("Web");
    expect(settings).toContain("Sprints");
    expect(settings).toContain("On");
    // the review role is named from the roster
    expect(settings).toContain("Developer");
    expect(settings).not.toContain("/dashboard");
  });

  it("never points at the old panel: list, task, note, placeholder", async () => {
    const { ProjectsScreen } = await import("@/next-ui/screens/projects/projects-screen");
    const { NoteScreen } = await import("@/next-ui/screens/projects/note-screen");
    const { ComingSoon } = await import("@/next-ui/patterns/coming-soon");
    const { DashboardScreen } = await import("@/next-ui/screens/dashboard-screen");
    for (const node of [
      React.createElement(ProjectsScreen),
      React.createElement(NoteScreen, { id: "p1_n1" }),
      React.createElement(ComingSoon, { title: "Inbox" }),
      React.createElement(DashboardScreen),
    ]) {
      const html = await render(node);
      expect(html).not.toContain("/dashboard");
      expect(html).not.toContain("current panel");
    }
  });

  it("shows a note with its body and a task with its details", async () => {
    const { NoteScreen } = await import("@/next-ui/screens/projects/note-screen");
    const note = await render(React.createElement(NoteScreen, { id: "p1_n1" }));
    expect(note).toContain("Kickoff meeting");
    expect(note).toContain("Meeting note");
    expect(note).toContain('data-testid="note-body"');

    const { TaskScreen } = await import("@/next-ui/screens/projects/task-screen");
    const pending = await render(React.createElement(TaskScreen, { id: "p1_t1" }));
    expect(pending).toContain("aria-busy");
  });
});
