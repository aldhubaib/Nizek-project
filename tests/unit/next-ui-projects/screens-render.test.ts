// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
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

// The project's own roles (copies of the presets), as the Settings view lists them.
const ROLES = [
  { id: "r0", projectId: "p1", presetId: "pr0", name: "Admin", isAdmin: true, isClient: false, isTeamLead: false, _count: { members: 1 } },
  { id: "r1", projectId: "p1", presetId: "pr1", name: "Developer", isAdmin: false, isClient: false, isTeamLead: false, _count: { members: 1 } },
  { id: "r2", projectId: "p1", presetId: "pr2", name: "Client", isAdmin: false, isClient: true, isTeamLead: false, _count: { members: 0 } },
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
  sprint({ id: "s-next", name: "Sprint 14", status: "NEXT", startDate: inDays(22), endDate: inDays(35), taskCount: 0 }),
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

const idle = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined });
const query = <T,>(data: T) => () => ({ data, isPending: false, isError: false, error: null });

vi.mock("@/next-ui/data/projects", () => ({
  PROJECTS_KEY: ["projects"],
  projectKey: (id: string) => ["projects", id],
  kanbanOn: (p: { board?: { enabled: boolean } | null }) => p.board?.enabled === true,
  proofVideoModeOf: (p: { proofVideoMode?: string | null } | undefined) => p?.proofVideoMode ?? "SELF",
  useProjects: () => ({ data: PROJECTS, isPending: false, error: null }),
  useProject: () => ({ data: DETAIL, isPending: false, error: null }),
  useProjectLabel: () => "Alpha Portal",
  useProjectBrief: () => ({ name: "Alpha Portal", logoUrl: null, sprintsEnabled: true, kanbanEnabled: false, counts: { notes: 3, assets: 9, members: 2 } }),
  useProjectInvitations: () => ({ data: INVITATIONS, isPending: false, error: null }),
  useProjectRoles: () => ({ data: ROLES, isPending: false, isError: false, error: null }),
  useTeams: () => ({ data: [{ id: "t1", name: "Web" }, { id: "t2", name: "Mobile" }], isPending: false, error: null }),
  useUpdateProject: idle,
  useUploadProjectLogo: idle,
  useSetProjectSprints: idle,
  useSetProjectClientChat: idle,
  useSetProofVideoMode: idle,
  useSetProofUploaders: idle,
  useCreateRole: idle,
  useUpdateRole: idle,
  useDeleteRole: idle,
}));

/** The Kanban of the project: three columns, one card type, three tasks; `board.current` is what `useBoard` answers. */
const ALL_PERMISSIONS = { isAdmin: true, canManageColumns: true, canManageTypes: true, canManageMembers: true, canCreateCard: true, canEditCard: true, canDeleteCard: true, canMoveCard: true, canComment: true };
const READ_PERMISSIONS = { isAdmin: false, canManageColumns: false, canManageTypes: false, canManageMembers: false, canCreateCard: false, canEditCard: false, canDeleteCard: false, canMoveCard: false, canComment: false };
const card = (id: string, title: string, columnId: string, position: number, description: string | null = null) => ({
  id,
  cardNumber: Number(id.slice(1)),
  title,
  description,
  columnId,
  cardTypeId: "ct1",
  position,
  assignee: null,
  commentCount: 0,
  isComplete: false,
  startDate: null,
  dueDate: null,
  dueDone: false,
  labelIds: [],
  updatedAt: new Date("2026-03-01T00:00:00Z"),
});
const BOARD = {
  id: "b1",
  name: "Board",
  enabled: true,
  columns: [
    { id: "col1", name: "To do", color: "slate", position: 1000 },
    { id: "col2", name: "In progress", color: "sky", position: 2000 },
    { id: "col3", name: "Completed", color: "green", position: 3000 },
  ],
  cardTypes: [{ id: "ct1", name: "Task", icon: "square", color: "slate", fields: [] }],
  labels: [],
  cards: [card("k2", "Write the brief", "col1", 2000, "Two pages, with the scope and the dates."), card("k1", "Set up the repo", "col1", 1000), card("k3", "Design the login", "col2", 1000)],
  members: [],
  permissions: ALL_PERMISSIONS,
  viewerId: "u2",
};
const board: { current: typeof BOARD | null } = { current: BOARD };

vi.mock("@/next-ui/data/kanban", () => ({
  boardKey: (id: string) => ["projects", id, "board"],
  useBoard: () => ({ data: board.current, isPending: false, error: null }),
  useBoardState: () => ({ data: { exists: true, enabled: true, visible: true }, isPending: false, error: null }),
  useCreateCard: idle,
  useUpdateCard: idle,
  useMoveCard: idle,
  useDeleteCard: idle,
  useSetProjectKanban: idle,
}));

vi.mock("@/next-ui/data/team", () => ({
  TransferRequiredError: class TransferRequiredError extends Error {},
  useAvailableUsers: () => ({ data: [], isPending: false, error: null }),
  useAddMembers: idle,
  useInviteMember: idle,
  useUpdateMemberRole: idle,
  useRemoveMember: idle,
  useCancelInvitation: idle,
}));

vi.mock("@/next-ui/data/vault", () => ({
  useProjectVault: query(VAULT),
  useVaultFolders: query([{ id: "f1", name: "Production", credentialCount: 1 }]),
  useRevealSecret: idle,
  useCreateCredential: idle,
  useUpdateCredential: idle,
  useDeleteCredential: idle,
  useCreateFolder: idle,
  useRenameFolder: idle,
  useDeleteFolder: idle,
}));

/* One task opened as a page: an enhancement still in the backlog, two of its three questions answered. */
const QUESTIONS = [
  { id: "q1", question: "Current behaviour?", type: "text", options: null, multiple: false, mandatory: true, order: 1, taskType: "FEATURE" },
  { id: "q2", question: "Who is it for?", type: "select", options: JSON.stringify(["Admin", "Client"]), multiple: false, mandatory: true, order: 2, taskType: "FEATURE" },
  { id: "q3", question: "Do we need anything from the client?", type: "client", options: null, multiple: false, mandatory: false, order: 3, taskType: "FEATURE" },
  { id: "q9", question: "Steps to reproduce?", type: "text", options: null, multiple: false, mandatory: true, order: 1, taskType: "BUG" },
];
const TASK_PANEL = {
  projectId: "p1",
  projectName: "Alpha Portal",
  proofVideoMode: "SELF",
  questions: QUESTIONS,
  initialAnswers: { q1: "The default button colour scores Low.", q3: JSON.stringify({ needed: false, note: "", completed: false, completedAt: null }) },
  initialNotes: [{ id: "n1", title: "Kickoff meeting", noteType: "MEETING", date: "2026-02-01T00:00:00.000Z", author: { name: "Sara" } }],
  isAdmin: true,
  canDelete: true,
  editBlockedReason: null,
  task: {
    id: "t1",
    taskNumber: 491,
    title: "Research the DSP integration",
    description: "<p>Why the colour scores low.</p>",
    priority: "NORMAL",
    taskType: "FEATURE",
    stage: "BACKLOG",
    order: 0,
    assignee: null,
    createdBy: { id: "u2", name: "Omar", imageUrl: null },
    createdAt: "2026-02-03T00:00:00.000Z",
    estimatedMinutes: 120,
    estimateAccuracy: null,
    sprints: [{ id: "s-done", name: "Sprint 11", status: "COMPLETED", startDate: "2026-01-05T00:00:00.000Z", endDate: "2026-01-16T00:00:00.000Z", estimatedMinutes: 120 }],
  },
};

vi.mock("@/next-ui/data/tasks", () => ({
  projectTasksKey: (id: string) => ["projects", id, "tasks"],
  taskKey: (id: string) => ["tasks", id],
  taskErrorText: (err: unknown) => String(err),
  uploadAttachments: async () => [],
  useProjectTasks: query(TASKS),
  useTask: vi.fn((taskId: string) => (taskId === "t1" ? query(TASK_PANEL)() : { data: null, isPending: true, error: null })),
  useTaskProofVideos: query({ approved: [{ id: "v1", filename: "login-flow.mp4", url: "https://cdn.example.com/v1.mp4", fileSize: 1024, mimeType: "video/mp4", createdAt: "2026-02-05T10:00:00.000Z" }], history: [] }),
  useTaskHistory: query({
    allowed: true,
    visits: [{ id: "sv1", stage: "BACKLOG", fromStage: null, enteredAt: "2026-02-03T00:00:00.000Z", exitedAt: null, durationMs: 3 * 86_400_000, ongoing: true, source: "TASK_CREATED", reason: null, actor: { id: "u2", name: "Omar", imageUrl: null }, sprintId: null, sprintName: null, assignee: null }],
    activities: [{ id: "ac1", action: "updated", field: "priority", oldValue: "LOW", newValue: "NORMAL", createdAt: "2026-02-04T09:00:00.000Z", user: { id: "u2", name: "Omar", imageUrl: null } }],
    summary: { createdAt: "2026-02-03T00:00:00.000Z", totalMs: 3 * 86_400_000, currentStage: "BACKLOG", currentStageMs: 3 * 86_400_000, regressions: 0, timeOutsideSprintMs: 0, stageTotals: [] },
  }),
  useTaskLabel: () => "F-491 · Research the DSP integration",
  useTaskCrumb: () => "F-491",
  taskLabel: () => "",
  useEligibleAssignees: query([]),
  useTaskComments: query([]),
  useProofVideoSettings: query({ mode: "SELF", uploaders: [] }),
  useProofBypassStatus: query(null),
  useMoveTask: idle,
  useScheduleTask: idle,
  useReorderTasks: idle,
  useCreateTask: idle,
  useUpdateTask: idle,
  useSaveTaskAnswers: idle,
  useAssignTaskToMe: idle,
  useDeleteTask: idle,
  useDeclineTask: idle,
  useSubmitProof: idle,
  useRequestProofBypass: idle,
  useAddComment: idle,
  useDeleteComment: idle,
}));

/* The sprint documents: Sprint 14 (Next) is being planned with a blank schedule and one task
 * short of an estimate; Sprint 12 (Active) is under review with one task done and one not. */
const planTask = (over: Record<string, unknown>) => ({
  id: "pt",
  code: "F-1",
  title: "Task",
  taskType: "FEATURE",
  stage: "PLANNED",
  estimatedMinutes: 120,
  sprintCount: 1,
  assignee: person,
  questions: [{ question: "Where does it show?", answer: "On the home screen." }],
  decision: "Build it in-house.",
  risk: "None known.",
  ...over,
});
const BLANK_INFO = { sprintId: "s-next", sprintName: "Sprint 14", status: "NEXT", documentDate: "", documentDateIso: "", startDate: "", endDate: "", startIso: "", endIso: "", workingDays: "" };
const PLAN = {
  sprintName: "Sprint 14",
  status: "NEXT",
  tasks: [planTask({ id: "t1", code: "F-491", title: "Research the DSP integration" }), planTask({ id: "t2", code: "F-17", title: "Market place MVP", estimatedMinutes: null, assignee: null, decision: "", risk: "" })],
  info: BLANK_INFO,
  activeSprintName: null,
  proofVideoMode: "SELF",
  reviewVideos: [],
};
const ACTIVE_INFO = { sprintId: "s-active", sprintName: "Sprint 12", status: "ACTIVE", documentDate: "1 Mar 2026", documentDateIso: "2026-03-01", reviewDate: "15 Mar 2026", reviewDateIso: "2026-03-15", startDate: "2 Mar 2026", endDate: "13 Mar 2026", startIso: "2026-03-02", endIso: "2026-03-13", workingDays: 10, locked: true };
const ACTIVE_PLAN = { ...PLAN, sprintName: "Sprint 12", status: "ACTIVE", tasks: [planTask({ id: "t4", code: "B-5", title: "Fix login", taskType: "BUG", stage: "IN_DEVELOPMENT" }), planTask({ id: "t5", code: "F-6", title: "Ship onboarding", stage: "DONE" })], info: ACTIVE_INFO };
const REVIEW = { sprintName: "Sprint 12", status: "ACTIVE", completed: [ACTIVE_PLAN.tasks[1]], incomplete: [ACTIVE_PLAN.tasks[0]], info: ACTIVE_INFO, removed: [] };
const DOC = {
  "s-next": { noteId: "n-plan", info: BLANK_INFO, carry: {}, committedIds: [], hasOutcome: false, canEdit: true },
  "s-active": { noteId: "n-review", info: ACTIVE_INFO, carry: { t4: { incompleteReason: "Blocked by the vendor." } }, committedIds: ["t4", "t5"], hasOutcome: true, canEdit: true },
} as Record<string, unknown>;

vi.mock("@/next-ui/data/sprints", () => ({
  useSprints: query(SPRINTS),
  useSprintLabel: () => "Sprint 14",
  useSprintSnapshots: () => ({ data: undefined }),
  useSprintPlanFlags: query({}),
  useSprintPlan: (sprintId: string) => query(sprintId === "s-active" ? ACTIVE_PLAN : PLAN)(),
  useSprintReview: (sprintId: string) => query(sprintId === "s-active" ? REVIEW : undefined)(),
  useSprintProof: query({}),
  useSprintDoc: (sprintId: string) => query(DOC[sprintId] ?? null)(),
  useEnsureSprint: idle,
  useSetSprintColumn: idle,
  useUpdateSprint: idle,
  useDeleteSprint: idle,
  useStartSprint: idle,
  useEndSprint: idle,
  useUpdateSprintDocInfo: idle,
  useUpdateSprintDocCard: idle,
  useUpdatePlanTask: idle,
  useUpdateTaskPlan: idle,
  useAddSprintReviewVideos: idle,
  useRemoveSprintReviewVideo: idle,
}));

vi.mock("@/next-ui/data/notes", () => ({
  useProjectNotes: query(NOTES),
  useNote: query(NOTES[0]),
  useNoteLabel: () => "Kickoff meeting",
  useCreateNote: idle,
  useUpdateNote: idle,
  useDeleteNote: idle,
  useToggleNoteDone: idle,
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

/** Mounts a screen as a pane would — with a header slot for its actions — and answers both halves' HTML. */
async function mountInPane(node: React.ReactElement): Promise<{ header: string; body: string }> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { TooltipProvider } = await import("@/next-ui/ui/tooltip");
  const { PaneContext } = await import("@/next-ui/panes/use-pane");
  const host = document.createElement("div");
  const slot = document.createElement("div");
  document.body.append(slot, host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(TooltipProvider, null, React.createElement(PaneContext.Provider, { value: { side: false, entry: null, actions: slot, overflow: null, mode: "header" } }, node)));
  });
  const out = { header: slot.innerHTML, body: host.innerHTML };
  await act(async () => root.unmount());
  slot.remove();
  host.remove();
  return out;
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
    const { viewerRights } = await import("@/next-ui/screens/projects/project-screen");
    // a reader (nobody signed in): the board, nothing to press
    const reader = viewerRights(DETAIL as never, undefined, undefined);
    const html = await render(React.createElement(ActiveSprintTab, { project: DETAIL as never, rights: reader }));
    expect(html).toContain("Sprint 12");
    expect(html).toContain("1 of 2 done");
    for (const stage of ["Todo", "In Development", "Internal Review", "Done"]) expect(html).toContain(stage);
    expect(html).toContain("Fix login");
    expect(html).toContain("1h 30m");
    expect(html).toContain("Ship onboarding");
    expect(html).not.toContain("Market place MVP");
    expect(html).not.toContain('data-testid="record-menu"');

    // a system admin: the card in development has its ⋯ with the next stage; a done task has nowhere further to go
    const admin = viewerRights(DETAIL as never, "u2", "ADMIN");
    expect(admin.canMoveTasks).toBe(true);
    const full = await render(React.createElement(ActiveSprintTab, { project: DETAIL as never, rights: admin }));
    expect((full.match(/data-testid="record-menu"/g) ?? []).length).toBe(1);
    expect((full.match(/aria-roledescription="draggable"/g) ?? []).length).toBe(2);
  });

  it("lets someone with task rights drag the road map and add tasks; a reader only looks", async () => {
    const { RoadmapView } = await import("@/next-ui/screens/projects/roadmap-view");
    const { viewerRights } = await import("@/next-ui/screens/projects/project-screen");
    const admin = viewerRights(DETAIL as never, "u2", "ADMIN");
    const html = await render(React.createElement(RoadmapView, { project: DETAIL as never, rights: admin }));
    expect(html).toContain('data-testid="lane-board"');
    // every loose task is a draggable card
    expect((html.match(/aria-roledescription="draggable"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // the sprint cards and the Planned/Next lanes offer their ⋯; the Next lane its "Plan and start"
    expect((html.match(/data-testid="record-menu"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('aria-label="Plan and start sprint"');
    // planning happens on the sprint's document page, as in the live panel: the ▷ and every card lead there
    expect(html).toMatch(/aria-label="Plan and start sprint"[^>]*href="\/next\/projects\/p1\/sprints\/s-next"/);
    expect(html).toContain('href="/next/projects/p1/sprints/s-active"');
    expect(html).toContain('href="/next/projects/p1/sprints/s-done"');
    expect(html).not.toContain('data-testid="plan-sprint-dialog"');
    expect(html).not.toContain("/dashboard");

    const reader = viewerRights(DETAIL as never, undefined, undefined);
    const read = await render(React.createElement(RoadmapView, { project: DETAIL as never, rights: reader }));
    expect(read).not.toContain('aria-roledescription="draggable"');
    expect(read).not.toContain('data-testid="record-menu"');
    expect(read).not.toContain('aria-label="Plan and start sprint"');
    // a reader still opens a sprint's document to read it
    expect(read).toContain('href="/next/projects/p1/sprints/s-active"');
  });

  it("shows a sprint's document with the live panel's structure: the plan before it starts, the review after", async () => {
    const { SprintScreen } = await import("@/next-ui/screens/projects/sprint-screen");
    const { ViewerProvider } = await import("@/next-ui/lib/viewer");
    const admin = { id: "u2", name: "Omar", email: "omar@nizek.com", systemRole: "ADMIN" };
    const asAdmin = (id: string) => render(React.createElement(ViewerProvider, { viewer: admin }, React.createElement(SprintScreen, { id })));

    // planning Sprint 14: title, the tiles, a blank Sprint Information table, Introduction, the task cards
    const plan = await asAdmin("p1_s-next");
    expect(plan).toContain('data-testid="sprint-doc"');
    expect(plan).toContain('data-phase="planning"');
    expect(plan).toMatch(/<h1[^>]*>[^<]*Sprint 14/);
    expect(plan).toContain('data-testid="sprint-summary"');
    expect(plan).toContain("Sprint Information");
    for (const row of ["Plan Date", "Sprint Start", "Sprint End", "Total Working Days"]) expect(plan).toContain(row);
    expect(plan).not.toContain("Review Date");
    expect(plan).toContain("Introduction");
    expect(plan).toContain("List of Sprint Items");
    expect((plan.match(/data-testid="sprint-task-card"/g) ?? []).length).toBe(2);
    expect(plan).toContain("Research the DSP integration");
    expect(plan).toContain("Where does it show?");
    expect(plan).toContain("Decision");
    expect(plan).toContain("Risk");
    // Decision and Risk are a choice first: two buttons each, nothing pressed until someone presses one
    expect(plan).toContain(">As described<");
    expect(plan).toContain(">Different decision<");
    expect(plan).toContain(">No risk<");
    expect(plan).toContain(">Risk<");
    // the first task's words pick "Different decision" and show in the box; the second has chosen nothing yet
    expect(plan).toMatch(/data-testid="sprint-decision" data-choice="some"[^]*?<textarea[^>]*data-testid="sprint-decision-text"[^>]*>Build it in-house\.<\/textarea>/);
    expect(plan).toMatch(/data-testid="sprint-decision" data-choice="unset"/);
    expect(plan).toMatch(/data-testid="sprint-risk" data-choice="unset"/);
    expect((plan.match(/role="radio" aria-checked="true"/g) ?? []).length).toBe(2);
    // each card is one framed box: a title band with nothing else in it, the questions, then under
    // a rule the plan for that task — estimate and person as labelled pills beside Decision and Risk
    expect((plan.match(/data-testid="sprint-task-plan"/g) ?? []).length).toBe(2);
    const head = plan.match(/<header[^>]*data-testid="sprint-task-head"[^>]*>[^]*?<\/header>/)?.[0] ?? "";
    expect(head).toContain("Research the DSP integration");
    expect(head).not.toContain("sprint-estimate");
    expect(head).not.toContain("sprint-assignee");
    expect(plan.indexOf('data-testid="sprint-task-qa"')).toBeLessThan(plan.indexOf('data-testid="sprint-estimate"'));
    expect(plan.indexOf('data-testid="sprint-estimate"')).toBeLessThan(plan.indexOf('data-testid="sprint-decision"'));
    expect(plan).toContain("Assigned to");
    expect(plan).toContain(">2h<");
    expect(plan).toContain(">Sara<");
    expect(plan).toContain(">Add estimate<");
    expect(plan).toContain(">Assign<");
    expect(plan).not.toContain('data-testid="sprint-task-outcome"');
    // what Start still waits for: the four schedule cells, one estimate, one person, one Decision, one Risk
    expect(plan).toContain('data-testid="sprint-missing"');
    expect(plan).toContain("4 sprint information fields · 1 estimate · 1 assignee · 1 decision · 1 risk");
    expect(plan).not.toContain("/dashboard");

    // reviewing Sprint 12: Review Date, the outcome groups, a reason asked for the unfinished task
    const review = await asAdmin("p1_s-active");
    expect(review).toContain('data-phase="review"');
    expect(review).toMatch(/<h1[^>]*>[^<]*Sprint 12/);
    expect(review).toContain("Review Date");
    expect(review).toContain("Committed work");
    expect(review).toContain("Completed");
    expect(review).toContain("Not completed");
    expect(review).toContain('data-variant="completed"');
    expect(review).toContain('data-variant="incomplete"');
    expect(review).toContain("Proof of work");
    expect(review).toContain("Reason it was not completed");
    expect(review).toContain("Blocked by the vendor.");
    expect(review).not.toContain("List of Sprint Items");
    // how it went sits under its own rule, after the plan the task was given
    expect((review.match(/data-testid="sprint-task-outcome"/g) ?? []).length).toBe(2);
    expect(review.indexOf('data-testid="sprint-task-plan"')).toBeLessThan(review.indexOf('data-testid="sprint-task-outcome"'));
    // the plan is read there: the pills stay, nothing to press
    expect(review).toMatch(/<span[^>]*data-testid="sprint-assignee"[^>]*>[^]*?Sara<\/span>/);
    expect(review).toMatch(/<button[^>]*disabled=""[^>]*data-testid="sprint-estimate"/);

    // the pane header: one button whose ring fills with the required fields — Start while planning
    // (8 of 12 still missing, so not ready), End while reviewing (everything in, so ready), nothing for a reader
    const planHead = await mountInPane(React.createElement(ViewerProvider, { viewer: admin }, React.createElement(SprintScreen, { id: "p1_s-next" })));
    const startButton = planHead.header.match(/<button[^>]*data-testid="start-sprint"[^>]*>/)?.[0] ?? "";
    expect(startButton).toContain('data-ready="false"');
    expect(startButton).toContain('data-missing="8"');
    expect(startButton).toContain('data-total="12"');
    expect(startButton).toContain('aria-disabled="true"');
    expect(planHead.header).toContain("Start sprint · 8 missing");
    expect(planHead.header).not.toContain('data-testid="sprint-missing-compact"');
    expect(planHead.header).not.toContain('data-testid="end-sprint"');
    const reviewHead = await mountInPane(React.createElement(ViewerProvider, { viewer: admin }, React.createElement(SprintScreen, { id: "p1_s-active" })));
    const endButton = reviewHead.header.match(/<button[^>]*data-testid="end-sprint"[^>]*>/)?.[0] ?? "";
    expect(endButton).toContain('data-ready="true"');
    expect(endButton).toContain('data-missing="0"');
    expect(endButton).not.toContain("aria-disabled");
    expect(reviewHead.header).not.toContain('data-testid="start-sprint"');
    const readHead = await mountInPane(React.createElement(SprintScreen, { id: "p1_s-next" }));
    expect(readHead.body).toContain("Sprint Information");
    expect(readHead.header).not.toContain('data-testid="start-sprint"');
    expect(readHead.header).not.toContain('data-testid="edit-sprint-dates"');
    expect(readHead.body).not.toContain("/dashboard");
  });

  it("reads a sprint document's breadcrumb as Projects › project › sprint, the project a link back", async () => {
    const { PaneCrumbs } = await import("@/next-ui/panes/pane-crumbs");
    const html = await render(React.createElement(PaneCrumbs, { side: false, entry: { kind: "sprint", id: "p1_s-next" }, pathname: "/next/projects/p1/sprints/s-next" }));
    expect(html).toContain("Projects");
    expect(html).toContain("Alpha Portal");
    expect(html).toContain("Sprint 14");
    expect(html.indexOf("Projects")).toBeLessThan(html.indexOf("Alpha Portal"));
    expect(html.indexOf("Alpha Portal")).toBeLessThan(html.indexOf("Sprint 14"));
    expect(html).toMatch(/<a[^>]*href="\/next\/projects\/p1"[^>]*>[^]*?Alpha Portal/);
    expect(html).toMatch(/aria-current="page"[^>]*>Sprint 14/);
    // a task and a note under the project read the same way; the project itself does not repeat
    const task = await render(React.createElement(PaneCrumbs, { side: true, entry: { kind: "task", id: "p1_t1" }, pathname: "/next/projects" }));
    expect(task.indexOf("Alpha Portal")).toBeGreaterThan(-1);
    expect(task).toMatch(/<a[^>]*href="\/next\/projects\/p1"/);
    const view = await render(React.createElement(PaneCrumbs, { side: false, entry: { kind: "project", id: "p1", view: "roadmap" }, pathname: "/next/projects/p1/roadmap" }));
    expect((view.match(/Alpha Portal/g) ?? []).length).toBe(1);
    expect(view).toMatch(/aria-current="page"[^>]*>Road map/);
  });

  it("lists notes as text cards (kind, title, opening, date and author; no word count) and files as rows", async () => {
    const { NotesView } = await import("@/next-ui/screens/projects/notes-view");
    const notes = await render(React.createElement(NotesView, { projectId: "p1" }));
    expect(notes).toContain('data-layout="grid"');
    expect(notes).toContain('data-testid="text-card"');
    expect(notes).toContain("Meeting note");
    expect(notes).not.toMatch(/\d+ words?/);
    expect(notes).toContain("Kickoff meeting");
    // the opening is the body's paragraphs, not one line
    expect(notes).toMatch(/data-testid="text-card-opening"[^]*<p[^>]*>We agreed on the scope\.<\/p>/);
    expect(notes).toContain("1 Feb 2026");
    // the writer is an avatar with the name on hover, not a name in the line
    const author = notes.match(/<span[^>]*data-testid="note-author"[^>]*>/)?.[0] ?? "";
    expect(author).toContain('title="Sara"');
    expect(author).toContain('aria-label="Sara"');
    expect(notes).not.toMatch(/>\s*Sara\s*</);
    expect(notes).toContain('data-href="/next/projects/p1/notes/n1"');
    // a reader has no ⋯ on a note
    expect(notes).not.toContain('data-testid="record-menu"');
    // a member who writes notes gets one per note (the "New note" button lives in the pane header)
    const { viewerRights } = await import("@/next-ui/screens/projects/project-screen");
    const writer = viewerRights(DETAIL as never, "u1", "USER");
    expect(writer.canWriteNotes).toBe(true);
    const mine = await render(React.createElement(NotesView, { projectId: "p1", rights: writer }));
    expect((mine.match(/data-testid="record-menu"/g) ?? []).length).toBe(1);

    const { AssetsView } = await import("@/next-ui/screens/projects/assets-view");
    const files = await render(React.createElement(AssetsView, { projectId: "p1", canUpload: true, canDelete: false }));
    expect(files).toContain("brief.pdf");
    expect(files).toContain("2.3 MB");
    // the Upload button lives in the pane header (see list-tools.test.ts); only its file input is in the body
    expect(files).toContain("Choose files to upload");
    expect(files).toContain("1 file");
  });

  it("shows the team: members by role, then who is invited; no controls for a reader", async () => {
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
    expect(html).not.toContain('data-testid="record-menu"');
  });

  it("gives someone who manages the team a menu on every member and invitation", async () => {
    const { TeamView } = await import("@/next-ui/screens/projects/team-view");
    const all = { canManageTeam: true, canInviteMembers: true, canInviteClients: true };
    const html = await render(React.createElement(TeamView, { project: DETAIL as never, now, rights: all }));
    // two members and one invitation, each with its ⋯ (the "Add people" button lives in the pane header)
    expect((html.match(/data-testid="record-menu"/g) ?? []).length).toBe(3);
    expect((html.match(/data-testid="team-member"/g) ?? []).length).toBe(2);
    expect(html).toContain('data-testid="team-invitation"');

    // someone who may only bring in clients: the staff rows have no menu, the client invitation keeps its one
    const clientsOnly = { canManageTeam: true, canInviteMembers: false, canInviteClients: true };
    const limited = await render(React.createElement(TeamView, { project: DETAIL as never, now, rights: clientsOnly }));
    expect((limited.match(/data-testid="record-menu"/g) ?? []).length).toBe(1);
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
    // the secret itself is never in the page; each entry has its ⋯ (show, edit, delete)
    expect(vault).not.toContain("hunter2");
    expect((vault.match(/data-testid="record-menu"/g) ?? []).length).toBe(1);

    const { SettingsView } = await import("@/next-ui/screens/projects/settings-view");
    const settings = await render(React.createElement(SettingsView, { project: DETAIL as never }));
    expect(settings).toContain("Customer portal rebuild");
    expect(settings).toContain("Web");
    expect(settings).toContain("Sprints");
    expect(settings).toContain("On");
    // Kanban is a way of working too: off for a project without a board
    expect(settings).toMatch(/Kanban<\/dt><dd[^>]*>Off/);
    // the project's own roles, with their marks and member counts
    expect(settings).toContain('data-testid="settings-roles"');
    expect(settings).toContain("Developer");
    expect(settings).toContain("Chat only");
    expect((settings.match(/data-testid="settings-role"/g) ?? []).length).toBe(3);
    // the pipeline limit and the review assignee are gone
    expect(settings).not.toContain("Tasks in the pipeline at once");
    expect(settings).not.toContain("Internal review by");
    expect(settings).not.toContain("/dashboard");
    // a reader has no form
    expect(settings).not.toContain('data-testid="settings-general-form"');
    // the video rule, as a fact: this project keeps the default
    expect(settings).toContain('data-testid="settings-video-bypass"');
    expect(settings).toMatch(/Rule<\/dt><dd[^>]*>Default/);
    expect(settings).not.toContain("Uploads for others");

    // "Assign" names who uploads for others; nobody yet is said plainly
    const assigned = await render(
      React.createElement(SettingsView, { project: { ...DETAIL, proofVideoMode: "ASSIGNED" } as never }),
    );
    expect(assigned).toMatch(/Rule<\/dt><dd[^>]*>Assign/);
    expect(assigned).toContain("Nobody yet");
    const withSara = {
      ...DETAIL,
      proofVideoMode: "ASSIGNED",
      members: DETAIL.members.map((m) => (m.id === "m1" ? { ...m, canBypassProof: true } : m)),
    };
    const named = await render(React.createElement(SettingsView, { project: withSara as never }));
    expect(named).toMatch(/Uploads for others<\/dt><dd[^>]*>Sara/);
  });

  it("lets an admin edit the settings: the General form and the three switches", async () => {
    const { SettingsView } = await import("@/next-ui/screens/projects/settings-view");
    const html = await render(React.createElement(SettingsView, { project: DETAIL as never, canEdit: true }));
    expect(html).toContain('data-testid="settings-general-form"');
    expect(html).toContain('value="Alpha Portal"');
    expect(html).toContain("Customer portal rebuild");
    expect(html).toContain('data-testid="team-select"');
    expect(html).toContain('data-testid="logo-change"');
    expect(html).toContain('data-testid="project-sprints-switch"');
    expect(html).toContain('data-testid="project-kanban-switch"');
    expect(html).toContain("To do, In progress, Completed");
    expect(html).toContain('data-testid="project-client-chat-switch"');
    // nothing changed yet, so nothing to save
    expect(html).not.toContain("Save changes");
    // the roles are listed; only a project admin gets "New role" and the ⋯ on each
    expect((html.match(/data-testid="settings-role"/g) ?? []).length).toBe(3);
    expect(html).not.toContain('data-testid="new-role-button"');
    expect(html).toContain('data-testid="settings-dates"');
    const roles = await render(React.createElement(SettingsView, { project: DETAIL as never, canEdit: true, canEditRoles: true }));
    expect(roles).toContain('data-testid="new-role-button"');
    expect((roles.match(/data-testid="record-menu"/g) ?? []).length).toBe(3);
    // the video rule is a choice; the uploader list only appears for "Assign"
    expect(html).toContain('data-testid="video-mode-select"');
    expect(html).toContain("Whoever moves a task to Internal Review uploads its video");
    expect(html).not.toContain('data-testid="video-uploaders"');
    const assign = await render(
      React.createElement(SettingsView, { project: { ...DETAIL, proofVideoMode: "ASSIGNED" } as never, canEdit: true }),
    );
    expect(assign).toContain('data-testid="video-uploaders"');
    expect(assign).toContain("Sara");
    expect(assign).toContain("Omar");
    expect(assign).toContain("Nobody is assigned yet");
    // a project without sprints has no task review to prove, so no video rule
    const noSprints = await render(
      React.createElement(SettingsView, { project: { ...DETAIL, sprintsEnabled: false } as never, canEdit: true }),
    );
    expect(noSprints).not.toContain('data-testid="settings-video-bypass"');
  });

  it("shows the Kanban: its three columns in order, each task a title and its description, a ⋯ for those who may act", async () => {
    const { KanbanView } = await import("@/next-ui/screens/projects/kanban-view");
    const html = await render(React.createElement(KanbanView, { projectId: "p1", canEditSettings: true }));
    expect((html.match(/data-testid="kanban-column"/g) ?? []).length).toBe(3);
    expect(html.indexOf("To do")).toBeLessThan(html.indexOf("In progress"));
    expect(html.indexOf("In progress")).toBeLessThan(html.indexOf("Completed"));
    // the cards in their order within the column, by position and not by the list's order
    expect((html.match(/data-testid="kanban-card"/g) ?? []).length).toBe(3);
    expect(html.indexOf("Set up the repo")).toBeLessThan(html.indexOf("Write the brief"));
    expect(html).toContain("Two pages, with the scope and the dates.");
    expect(html).toContain("Nothing here yet");
    // nothing of the live board's extras: no card numbers, dates or assignees
    expect(html).not.toContain("#1");
    expect(html).not.toContain("Unassigned");
    // each card has its menu; each column its add button (the "New task" button lives in the pane header)
    expect((html.match(/data-testid="record-menu"/g) ?? []).length).toBe(3);
    expect((html.match(/data-testid="column-add"/g) ?? []).length).toBe(3);
    expect(html).not.toContain("/dashboard");

    // a reader sees the same board with nothing to press
    board.current = { ...BOARD, permissions: READ_PERMISSIONS };
    const read = await render(React.createElement(KanbanView, { projectId: "p1" }));
    expect((read.match(/data-testid="kanban-card"/g) ?? []).length).toBe(3);
    expect(read).not.toContain('data-testid="record-menu"');
    expect(read).not.toContain('data-testid="column-add"');

    // Kanban off (or no board yet): a word about where it is switched on, for someone who can
    board.current = null;
    const off = await render(React.createElement(KanbanView, { projectId: "p1", canEditSettings: true }));
    expect(off).toContain("Kanban is off");
    expect(off).toContain("Ways of working");
    expect(off).toContain("Open settings");
    expect(off).not.toContain("/dashboard");
    const offReader = await render(React.createElement(KanbanView, { projectId: "p1" }));
    expect(offReader).toContain("Kanban is off");
    expect(offReader).not.toContain("Open settings");
    // the project says it is on, yet there is no board for this viewer: a client account
    const shut = await render(React.createElement(KanbanView, { projectId: "p1", on: true }));
    expect(shut).toContain("not open to you");
    expect(shut).not.toContain("Kanban is off");
    board.current = BOARD;
  });

  it("opens the Kanban as a project page", async () => {
    const { ProjectScreen } = await import("@/next-ui/screens/projects/project-screen");
    const html = await render(React.createElement(ProjectScreen, { id: "p1", view: "kanban" }));
    expect(html).toContain("Alpha Portal · Kanban");
    expect((html.match(/data-testid="kanban-column"/g) ?? []).length).toBe(3);
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
    const pending = await render(React.createElement(TaskScreen, { id: "p1_t9" }));
    expect(pending).toContain("aria-busy");
  });

  it("shows a task as one form with the live page's fields: title, details, sprints, every question with its answer under it; nothing folds", async () => {
    const { TaskScreen } = await import("@/next-ui/screens/projects/task-screen");
    const { ViewerProvider } = await import("@/next-ui/lib/viewer");
    const admin = { id: "u2", name: "Omar", email: "omar@nizek.com", systemRole: "ADMIN" };
    const html = await render(React.createElement(ViewerProvider, { viewer: admin }, React.createElement(TaskScreen, { id: "p1_t1" })));
    expect(html).toContain('data-testid="task-form"');
    expect(html).not.toContain('data-testid="detail-section"');
    // the title is a field of its own, typed into while the task is in the backlog, and nothing else sits beside it
    expect(html).toContain(">Title<");
    expect(html).toMatch(/<textarea[^>]*data-testid="task-title"[^>]*>Research the DSP integration<\/textarea>/);
    expect(html).not.toContain("Created 3 Feb 2026");
    // the details are the live page's rows — type, who has it, who raised it, priority, status — and no estimate: that belongs to a sprint
    for (const label of ["Type", "Assigned to", "Reported by", "Priority", "Status"]) expect(html).toContain(`>${label}<`);
    expect(html).not.toMatch(/<label[^>]*>Estimate</);
    expect(html).not.toContain('id="task-estimate"');
    expect(html).toContain('data-testid="task-priority"');
    expect(html).toMatch(/data-testid="task-assignee"[^>]*>.*?Unassigned/);
    expect(html).toContain('data-testid="assign-me"');
    expect(html).not.toMatch(/id="task-assignee"[^>]*role="combobox"|role="combobox"[^>]*id="task-assignee"/);
    expect(html).toContain("Missing data");
    expect(html).toContain("Answer the required questions (*) below to take the task out of Missing data.");
    expect(html).not.toContain('data-testid="move-to-');
    // the sprints it was in, each with the estimate it had there
    expect(html).toContain(">Sprints history<");
    expect(html).toContain('data-href="/next/projects/p1/sprints/s-done"');
    expect(html).toMatch(/Estimate.*?2h/);
    // the questions of its own kind only, numbered, the answer under each; a required one still empty is marked
    expect(html).toContain('data-testid="task-questions"');
    expect(html).toContain("2 of 3 answered");
    expect(html).toContain("1. Current behaviour?");
    expect(html).toContain("2. Who is it for?");
    expect(html).toContain("3. Do we need anything from the client?");
    expect(html).not.toContain("Steps to reproduce?");
    expect(html).toMatch(/<textarea[^>]*id="q-q1"[^>]*>The default button colour scores Low\.<\/textarea>/);
    expect(html).toMatch(/id="q-q2"[^>]*aria-invalid="true"/);
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*data-testid="client-nothing"/);
    // the rest of the page, in the live page's order; a description is read, never typed into here
    const order = ['data-testid="task-details"', 'data-testid="task-sprints"', 'data-testid="task-questions"', 'data-testid="task-description"', 'data-testid="task-notes"', 'data-testid="task-proof"', 'data-testid="comments-section"', 'data-testid="task-history"'];
    for (let i = 1; i < order.length; i++) expect(html.indexOf(order[i - 1]), order[i]).toBeLessThan(html.indexOf(order[i]));
    expect(html).toMatch(/data-testid="task-description"[\s\S]*?aria-busy/); // the cleaned HTML comes with hydration
    expect(html).not.toMatch(/\sid="task-description"/); // no editor
    expect(html).toContain('data-href="/next/projects/p1/notes/n1"');
    expect(html).toMatch(/data-testid="proof-video" data-tag="Approved"/);
    expect(html).toContain("login-flow.mp4");
    expect(html).toContain("Omar created this task in Backlog");
    expect(html).toContain("Omar changed priority from LOW to NORMAL");
    expect(html).toContain("3d 0h so far");
    expect(html).toContain("In Backlog for 3d 0h");
    expect(html).not.toContain("/dashboard");

    // a reader (nobody signed in) sees the same form with the answers as text, nothing to type into
    const read = await render(React.createElement(TaskScreen, { id: "p1_t1" }));
    expect(read).toMatch(/<h2[^>]*data-testid="task-title"[^>]*>Research the DSP integration<\/h2>/);
    expect(read).not.toContain("<textarea");
    expect(read).toContain("The default button colour scores Low.");
    expect(read).toContain("Nothing chosen. Required before the task leaves Missing data.");
    expect(read).toContain("Nothing needed from the client");
    expect(read).not.toContain('data-testid="task-priority"');
    expect(read).toContain(">Normal<");
    expect(read).toContain(">Unassigned<");
    expect(read).not.toContain('data-testid="assign-me"');
  });

  it("locks the title and the answers once a task has left the backlog, and says so; an empty file question says no files", async () => {
    const { TaskScreen } = await import("@/next-ui/screens/projects/task-screen");
    const { ViewerProvider } = await import("@/next-ui/lib/viewer");
    const { useTask } = await import("@/next-ui/data/tasks");
    const admin = { id: "u2", name: "Omar", email: "omar@nizek.com", systemRole: "ADMIN" };
    const picked = {
      ...TASK_PANEL,
      questions: [...QUESTIONS, { id: "q4", question: "Attachments", type: "file", options: null, multiple: false, mandatory: false, order: 4, taskType: "FEATURE" }],
      task: { ...TASK_PANEL.task, stage: "TODO", assignee: { id: "u1", name: "Sara", imageUrl: null }, sprints: [{ ...TASK_PANEL.task.sprints[0], id: "s-next", name: "Sprint 12", status: "NEXT" }] },
    };
    vi.mocked(useTask).mockReturnValueOnce(query(picked)() as never);
    const html = await render(React.createElement(ViewerProvider, { viewer: admin }, React.createElement(TaskScreen, { id: "p1_t1" })));
    expect(html).toMatch(/<h2[^>]*data-testid="task-title"[^>]*>Research the DSP integration<\/h2>/);
    expect(html).not.toMatch(/<textarea[^>]*id="q-/);
    expect(html).toContain("The answers were given while the task was in the backlog and are kept as they were.");
    expect(html).toContain("No files attached.");
    expect(html).not.toContain("Not answered yet — required");
    // the priority is still a control at any stage, as on the live page
    expect(html).toContain('data-testid="task-priority"');
    // someone else has it; an admin may still take it over
    expect(html).toContain("Sara");
    expect(html).toContain('data-testid="assign-me"');
    // not in a running sprint, so no move buttons even for an admin
    expect(html).not.toContain('data-testid="move-to-');
  });
});
