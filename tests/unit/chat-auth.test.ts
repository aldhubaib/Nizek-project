import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/project-access", () => ({ hasProjectAccess: vi.fn() }));
vi.mock("@/lib/client-chat", () => ({
  CLIENT_CONVERSATION_KIND: "client",
  canAccessClientConversation: vi.fn(),
  isClientUser: (u: { systemRole: string } | null | undefined) =>
    u?.systemRole === "CLIENT",
}));

import { resolveThreadAccess, type ThreadAccessDeps } from "@/lib/chat-auth";
import { ANNOUNCEMENTS_CONVERSATION_ID } from "@/lib/announcements";

const staff = { id: "staff-1", systemRole: "DEVELOPER" };
const client = { id: "client-1", systemRole: "CLIENT" };

function makeDeps(overrides: Partial<ThreadAccessDeps> = {}): ThreadAccessDeps {
  return {
    findConversation: async () => null,
    isConversationParticipant: async () => false,
    checkClientConversation: async () => ({ ok: false, canPost: false }),
    findTaskProjectId: async () => null,
    checkProjectAccess: async () => false,
    ...overrides,
  };
}

describe("resolveThreadAccess", () => {
  it("allows staff to read Announcements and blocks clients", async () => {
    const deps = makeDeps();
    const staffRes = await resolveThreadAccess(
      staff,
      { conversationId: ANNOUNCEMENTS_CONVERSATION_ID },
      deps,
    );
    expect(staffRes).toEqual({
      allowed: true,
      canPost: true,
      isClientRoom: false,
      channel: `conv:${ANNOUNCEMENTS_CONVERSATION_ID}`,
      projectId: null,
    });

    const clientRes = await resolveThreadAccess(
      client,
      { conversationId: ANNOUNCEMENTS_CONVERSATION_ID },
      deps,
    );
    expect(clientRes.allowed).toBe(false);
  });

  it("blocks clients from direct conversations even if a participant row exists", async () => {
    const deps = makeDeps({
      findConversation: async () => ({ id: "dm-1", kind: "direct", projectId: null }),
      isConversationParticipant: async () => true,
    });

    const clientRes = await resolveThreadAccess(client, { conversationId: "dm-1" }, deps);
    expect(clientRes.allowed).toBe(false);

    const staffRes = await resolveThreadAccess(staff, { conversationId: "dm-1" }, deps);
    expect(staffRes.allowed).toBe(true);
    expect(staffRes.channel).toBe("conv:dm-1");
  });

  it("blocks non-participant staff from direct conversations", async () => {
    const deps = makeDeps({
      findConversation: async () => ({ id: "dm-1", kind: "direct", projectId: null }),
      isConversationParticipant: async () => false,
    });
    const res = await resolveThreadAccess(staff, { conversationId: "dm-1" }, deps);
    expect(res.allowed).toBe(false);
  });

  it("respects client room read vs post permissions", async () => {
    const deps = makeDeps({
      findConversation: async () => ({ id: "cr-1", kind: "client", projectId: "proj-1" }),
      checkClientConversation: async (_id, user) =>
        user.id === client.id ? { ok: true, canPost: true } : { ok: true, canPost: false },
    });

    const clientRes = await resolveThreadAccess(client, { conversationId: "cr-1" }, deps);
    expect(clientRes).toEqual({
      allowed: true,
      canPost: true,
      isClientRoom: true,
      channel: "conv:cr-1",
      projectId: "proj-1",
    });

    const viewerRes = await resolveThreadAccess(staff, { conversationId: "cr-1" }, deps);
    expect(viewerRes).toEqual({
      allowed: true,
      canPost: false,
      isClientRoom: true,
      channel: "conv:cr-1",
      projectId: "proj-1",
    });
  });

  it("blocks clients from internal project and task threads even when checkProjectAccess returns true", async () => {
    const deps = makeDeps({
      findTaskProjectId: async () => "proj-1",
      checkProjectAccess: async () => true,
    });

    expect((await resolveThreadAccess(client, { projectId: "proj-1" }, deps)).allowed).toBe(false);
    expect((await resolveThreadAccess(client, { taskId: "task-1" }, deps)).allowed).toBe(false);

    const staffProj = await resolveThreadAccess(staff, { projectId: "proj-1" }, deps);
    expect(staffProj.allowed).toBe(true);
    expect(staffProj.channel).toBe("project:proj-1");

    const staffTask = await resolveThreadAccess(staff, { taskId: "task-1" }, deps);
    expect(staffTask.allowed).toBe(true);
    expect(staffTask.channel).toBe("task:task-1");
  });
});
