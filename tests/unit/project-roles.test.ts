import { describe, it, expect, vi } from "vitest";
import {
  BUILT_IN_ADMIN_ROLE,
  canManageProjectRoles,
  roleCopyData,
  seedProjectRoles,
  type RoleDefinition,
} from "@/lib/project-roles";

const created = new Date("2026-01-05T00:00:00Z");

const developer: RoleDefinition & { id: string; createdAt: Date } = {
  id: "preset-dev",
  createdAt: created,
  name: "Developer",
  description: "Builds things",
  isAdmin: false,
  isClient: false,
  canCreateTask: true,
  canModifyTask: true,
  canMoveTask: true,
  canDeleteTask: false,
  canDeclineTask: false,
  isTeamLead: false,
  canCreateSprintPlanning: false,
  canStartSprint: false,
  canEndSprint: false,
  canDeleteSprint: false,
  canViewTaskHistory: true,
  allowedStages: null,
  allowedTransitions: '{"TODO":["IN_DEVELOPMENT"]}',
};

const client: RoleDefinition & { id: string; createdAt: Date } = {
  ...developer,
  id: "preset-client",
  name: "Client",
  description: "Chat only",
  isClient: true,
  canCreateTask: false,
  canModifyTask: false,
  canMoveTask: false,
  canViewTaskHistory: false,
  allowedTransitions: null,
};

const admin: RoleDefinition & { id: string; createdAt: Date } = {
  ...developer,
  id: "preset-admin",
  name: "Admin",
  isAdmin: true,
  canDeleteTask: true,
  canDeclineTask: true,
  canCreateSprintPlanning: true,
  canStartSprint: true,
  canEndSprint: true,
  canDeleteSprint: true,
};

describe("roleCopyData — a preset copied onto a project", () => {
  it("keeps the name, every flag and the stage rules, and only changes the owner", () => {
    const copy = roleCopyData(developer, "proj-1");
    expect(copy.projectId).toBe("proj-1");
    expect(copy.presetId).toBe("preset-dev");
    expect(copy.name).toBe("Developer");
    expect(copy.description).toBe("Builds things");
    expect(copy.canCreateTask).toBe(true);
    expect(copy.canModifyTask).toBe(true);
    expect(copy.canMoveTask).toBe(true);
    expect(copy.canViewTaskHistory).toBe(true);
    expect(copy.allowedTransitions).toBe('{"TODO":["IN_DEVELOPMENT"]}');
    // the order people know from the preset list is kept
    expect(copy.createdAt).toEqual(created);
    // the copy never carries the preset's own id
    expect("id" in copy).toBe(false);
  });

  it("keeps a chat-only role chat-only and an admin role admin", () => {
    const c = roleCopyData(client, "proj-1");
    expect(c.isClient).toBe(true);
    expect(c.canCreateTask).toBe(false);
    expect(c.allowedTransitions).toBeNull();
    const a = roleCopyData(admin, "proj-1");
    expect(a.isAdmin).toBe(true);
    expect(a.canDeleteSprint).toBe(true);
  });

  it("works from a bare definition with no preset behind it", () => {
    const copy = roleCopyData(BUILT_IN_ADMIN_ROLE, "proj-1");
    expect(copy.presetId).toBeNull();
    expect(copy.isAdmin).toBe(true);
    expect("createdAt" in copy).toBe(false);
  });
});

describe("canManageProjectRoles — who edits a project's roles", () => {
  it("lets a system admin through even without a seat on the project", () => {
    expect(canManageProjectRoles({ systemRole: "ADMIN" }, null)).toBe(true);
  });

  it("lets a member holding the project's Admin role through", () => {
    expect(
      canManageProjectRoles({ systemRole: "DEVELOPER" }, { role: "MEMBER", projectRole: { isAdmin: true } }),
    ).toBe(true);
  });

  it("falls back to the membership enum when the role row is gone", () => {
    expect(canManageProjectRoles({ systemRole: "DEVELOPER" }, { role: "ADMIN", projectRole: null })).toBe(true);
  });

  it("refuses everyone else", () => {
    expect(
      canManageProjectRoles({ systemRole: "DEVELOPER" }, { role: "MEMBER", projectRole: { isAdmin: false } }),
    ).toBe(false);
    expect(canManageProjectRoles({ systemRole: "CLIENT" }, { role: "CLIENT", projectRole: null })).toBe(false);
    expect(canManageProjectRoles({ systemRole: "DEVELOPER" }, null)).toBe(false);
  });
});

/** A stand-in for the Prisma client: records what is created and answers with the presets. */
function fakeDb(presets: (RoleDefinition & { id: string; createdAt: Date })[]) {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    projectRole: {
      findMany: vi.fn(async () => presets),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `copy-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      }),
    },
  };
}

describe("seedProjectRoles — what a new project starts with", () => {
  it("copies every preset onto the project, in preset order", async () => {
    const db = fakeDb([admin, developer, client]);
    const made = await seedProjectRoles(db as never, "proj-9");
    expect(db.projectRole.findMany).toHaveBeenCalledWith({ where: { projectId: null }, orderBy: { createdAt: "asc" } });
    expect(made.map((r) => r.name)).toEqual(["Admin", "Developer", "Client"]);
    expect(db.rows.every((r) => r.projectId === "proj-9")).toBe(true);
    expect(db.rows.map((r) => r.presetId)).toEqual(["preset-admin", "preset-dev", "preset-client"]);
  });

  it("adds a built-in Admin role when no preset is marked Admin, so the project stays manageable", async () => {
    const db = fakeDb([developer, client]);
    const made = await seedProjectRoles(db as never, "proj-9");
    expect(made.map((r) => r.name)).toEqual(["Admin", "Developer", "Client"]);
    expect(made[0].isAdmin).toBe(true);
    expect(made[0].presetId).toBeNull();
  });

  it("does not add a second Admin when a preset of that name exists but is not marked Admin", async () => {
    const plainAdmin = { ...developer, id: "preset-x", name: "Admin" };
    const db = fakeDb([plainAdmin, developer]);
    const made = await seedProjectRoles(db as never, "proj-9");
    expect(made.map((r) => r.name)).toEqual(["Admin", "Developer"]);
    expect(made[0].isAdmin).toBe(true);
  });
});
