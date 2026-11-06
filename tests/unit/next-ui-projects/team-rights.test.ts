// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

/**
 * Who sees the Team and Settings controls in the new panel. These mirror the server's rules
 * (`requireMemberManagement`, `requireProjectRole`); the server checks them again on every call.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/next/projects",
  useSearchParams: () => new URLSearchParams(),
}));

// the screens read their data through these; the real modules would reach for the server actions.
// Only the pure helpers are under test, so the hooks are stubs.
const none = () => undefined;
vi.mock("@/next-ui/data/projects", () => ({
  useProjectLabel: none,
  useProject: none,
  useProjectInvitations: none,
  useProjectRoles: none,
  proofVideoModeOf: (p: { proofVideoMode?: string | null } | undefined) => p?.proofVideoMode ?? "SELF",
}));
vi.mock("@/next-ui/data/tasks", () => ({ useTaskLabel: none, useTaskCrumb: none }));
vi.mock("@/next-ui/data/notes", () => ({ useNoteLabel: none }));
vi.mock("@/next-ui/data/team", () => ({ TransferRequiredError: class extends Error {} }));

const member = (over: Record<string, unknown>) => ({
  id: "m",
  role: "MEMBER",
  canInviteMembers: false,
  canInviteClients: false,
  projectRole: null,
  user: { id: "u", systemRole: "DEVELOPER" },
  ...over,
});

describe("viewerRights", () => {
  it("lets a system admin do everything, member of the project or not", async () => {
    const { viewerRights } = await import("@/next-ui/screens/projects/project-screen");
    const rights = viewerRights({ members: [] } as never, "admin", "ADMIN");
    expect(rights).toMatchObject({ canManageTeam: true, canInviteMembers: true, canInviteClients: true, canEditSettings: true, canDeleteAssets: true });
  });

  it("lets a project admin (a role marked Admin) manage the whole team", async () => {
    const { viewerRights } = await import("@/next-ui/screens/projects/project-screen");
    const p = { members: [member({ user: { id: "u1", systemRole: "DEVELOPER" }, projectRole: { isAdmin: true } })] };
    expect(viewerRights(p as never, "u1", "DEVELOPER")).toMatchObject({ canManageTeam: true, canInviteMembers: true, canInviteClients: true });
  });

  it("gives an ordinary member only what their seat allows", async () => {
    const { viewerRights } = await import("@/next-ui/screens/projects/project-screen");
    const p = { members: [member({ user: { id: "u1", systemRole: "DEVELOPER" }, canInviteClients: true })] };
    expect(viewerRights(p as never, "u1", "DEVELOPER")).toMatchObject({
      canManageTeam: true,
      canInviteMembers: false,
      canInviteClients: true,
      canEditSettings: false,
    });
    const none = { members: [member({ user: { id: "u1", systemRole: "DEVELOPER" } })] };
    expect(viewerRights(none as never, "u1", "DEVELOPER")).toMatchObject({ canManageTeam: false, canEditSettings: false });
  });

  it("opens the settings to admins and project managers by membership role", async () => {
    const { viewerRights } = await import("@/next-ui/screens/projects/project-screen");
    const pm = { members: [member({ role: "PROJECT_MANAGER", user: { id: "u1", systemRole: "DEVELOPER" } })] };
    expect(viewerRights(pm as never, "u1", "DEVELOPER").canEditSettings).toBe(true);
    const dev = { members: [member({ user: { id: "u1", systemRole: "DEVELOPER" } })] };
    expect(viewerRights(dev as never, "u1", "DEVELOPER").canEditSettings).toBe(false);
  });

  it("gives a stranger to the project nothing", async () => {
    const { viewerRights } = await import("@/next-ui/screens/projects/project-screen");
    const p = { members: [member({ user: { id: "u1", systemRole: "DEVELOPER" }, projectRole: { isAdmin: true } })] };
    expect(viewerRights(p as never, "someone-else", "DEVELOPER")).toMatchObject({ canManageTeam: false, canEditSettings: false, canUpload: true });
  });
});

describe("canManageMember", () => {
  it("needs the client right for a client seat and the member right for the others", async () => {
    const { canManageMember } = await import("@/next-ui/screens/projects/team-view");
    const client = member({ role: "CLIENT", user: { id: "c", systemRole: "CLIENT" } });
    const staff = member({ role: "MEMBER", user: { id: "s", systemRole: "DEVELOPER" } });
    const clientsOnly = { canManageTeam: true, canInviteMembers: false, canInviteClients: true };
    const membersOnly = { canManageTeam: true, canInviteMembers: true, canInviteClients: false };
    expect(canManageMember(client as never, clientsOnly)).toBe(true);
    expect(canManageMember(staff as never, clientsOnly)).toBe(false);
    expect(canManageMember(client as never, membersOnly)).toBe(false);
    expect(canManageMember(staff as never, membersOnly)).toBe(true);
  });
});

describe("the Add people dialog's choices", () => {
  const roles = [
    { id: "admin", name: "Admin", isAdmin: true, isClient: false },
    { id: "dev", name: "Developer", isAdmin: false, isClient: false },
    { id: "client", name: "Client", isAdmin: false, isClient: true },
  ];

  it("offers only the roles the viewer may give, and starts on an ordinary one", async () => {
    const { allowedRoles, defaultRoleId } = await import("@/next-ui/screens/projects/team-dialogs");
    const all = allowedRoles(roles as never, { canInviteMembers: true, canInviteClients: true });
    expect(all.map((r) => r.id)).toEqual(["admin", "dev", "client"]);
    expect(defaultRoleId(all)).toBe("dev");
    const clientsOnly = allowedRoles(roles as never, { canInviteMembers: false, canInviteClients: true });
    expect(clientsOnly.map((r) => r.id)).toEqual(["client"]);
    expect(defaultRoleId(clientsOnly)).toBe("client");
    expect(defaultRoleId([])).toBe("");
  });

  it("lists only the people the viewer may add", async () => {
    const { addableUsers } = await import("@/next-ui/screens/projects/team-dialogs");
    const users = [
      { id: "a", name: "Ali", email: "ali@nizek.com", imageUrl: null, isClient: false, pending: false },
      { id: "b", name: "Bea", email: "bea@client.com", imageUrl: null, isClient: true, pending: false },
    ];
    expect(addableUsers(users as never, { canInviteMembers: true, canInviteClients: false }).map((u) => u.id)).toEqual(["a"]);
    expect(addableUsers(users as never, { canInviteMembers: false, canInviteClients: true }).map((u) => u.id)).toEqual(["b"]);
  });
});
