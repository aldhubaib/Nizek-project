"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireProjectMember, requireProjectRole, requireStaffUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { removeFromAllowlistIfUnused, syncInviteDisplayName } from "@/lib/pending-invite";
import { validateContractDates } from "@/lib/contract-rules";
import {
  disableClientChat,
  enableClientChat,
  syncClientConversationParticipants,
  CLIENT_CONVERSATION_KIND,
} from "@/lib/client-chat";
import {
  membershipRoleFromProjectRole,
  promoteUserToClient,
  demoteClientIfUnneeded,
  ensureClientChatForProject,
  rememberClientSignup,
  forgetClientSignupIfUnused,
} from "@/lib/client-role";
import { joinDisplayName, splitDisplayName } from "@/lib/display-name";
import type { Gender } from "@/generated/prisma/client";
import { parseGender } from "@/lib/member-profile";
import {
  aliasesEnabled,
  aliasRequirement,
  AliasGenderMissingError,
  AliasPoolExhaustedError,
  availableAliasCount,
  claimAliasForMember,
  isAliasBlocked,
} from "@/lib/alias";

async function requireMemberManagement(projectId: string) {
  const { user, member } = await requireProjectMember(projectId);
  if (user.systemRole === "ADMIN") {
    return { user, member, canInviteMembers: true, canInviteClients: true };
  }
  if (member.projectRole?.isAdmin) {
    return { user, member, canInviteMembers: true, canInviteClients: true };
  }
  const fullMember = await prisma.projectMember.findUnique({
    where: { id: member.id },
    select: { canInviteMembers: true, canInviteClients: true },
  });
  const canInviteMembers = fullMember?.canInviteMembers ?? false;
  const canInviteClients = fullMember?.canInviteClients ?? false;
  if (!canInviteMembers && !canInviteClients) {
    throw new Error("Insufficient permissions");
  }
  return { user, member, canInviteMembers, canInviteClients };
}

/**
 * Refuse the caller's change unless this person could be given an alias on this
 * project — they already hold one, they are exempt, or the pool has one of
 * their gender free. Called before writing, so an admin gets a clear reason
 * instead of a member who is silently visible to the client.
 */
async function requireClaimableAlias(
  userId: string,
  projectId: string,
  /**
   * Value of the project's real-name switch to judge against. Defaults to what
   * the membership currently says; pass false to ask "could they be masked",
   * which is what turning that switch back off needs to know.
   */
  showRealName?: boolean,
): Promise<void> {
  // Nothing to claim while the mechanism is off, so nothing to refuse over.
  if (!(await aliasesEnabled(prisma))) return;

  const held = await prisma.aliasAssignment.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { id: true },
  });
  if (held) return;

  const [target, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        systemRole: true,
        excludeFromAlias: true,
        gender: true,
      },
    }),
    showRealName === undefined
      ? prisma.projectMember.findUnique({
          where: { userId_projectId: { userId, projectId } },
          select: { showRealName: true },
        })
      : null,
  ]);
  if (!target) return;

  // The role they are moving to decides this, not the one they hold now, so the
  // current membership role is deliberately not passed.
  const requirement = aliasRequirement(
    {
      systemRole: target.systemRole === "CLIENT" ? "MEMBER" : target.systemRole,
      excludeFromAlias: target.excludeFromAlias,
      gender: target.gender,
    },
    { showRealName: showRealName ?? membership?.showRealName ?? false },
  );
  if (requirement === "exempt") return;
  if (requirement === "no-gender") {
    throw new AliasGenderMissingError(target.name ?? target.email);
  }
  if ((await availableAliasCount(target.gender!)) === 0) {
    throw new AliasPoolExhaustedError(target.gender!);
  }
}

async function buildContractCode(prefixId: string, manualNumber?: string): Promise<{ code: string; prefixId: string }> {
  const prefix = await prisma.contractPrefix.findUniqueOrThrow({ where: { id: prefixId } });
  const num = manualNumber?.trim() || String(prefix.nextNumber).padStart(3, "0");
  if (!manualNumber?.trim()) {
    await prisma.contractPrefix.update({ where: { id: prefixId }, data: { nextNumber: { increment: 1 } } });
  }
  return { code: `${prefix.prefix}-${num}`, prefixId };
}

export async function createProject(data: {
  name: string;
  description?: string;
  teamId?: string;
  contract: {
    label?: string;
    prefixId?: string;
    contractNumber?: string;
    contractType?: "FULL_TEAM" | "PART_TEAM" | "FIXED" | "MAINTENANCE" | "STARTUP";
    startDate?: string;
    endDate?: string;
  };
}) {
  const user = await requireUser();

  if (!data.contract.startDate || !data.contract.endDate) {
    throw new Error("Start and end dates are required");
  }
  const startDate = new Date(data.contract.startDate);
  const endDate = new Date(data.contract.endDate);
  const dateError = validateContractDates(startDate, endDate, []);
  if (dateError) return { error: dateError } as any;

  let codeData: { code?: string; prefixId?: string } = {};
  if (data.contract.prefixId) {
    codeData = await buildContractCode(data.contract.prefixId, data.contract.contractNumber);
  }

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description,
      ...(data.teamId && { teamId: data.teamId }),
      contracts: {
        create: {
          label: data.contract.label,
          contractType: data.contract.contractType ?? "FULL_TEAM",
          startDate,
          endDate,
          ...(codeData.code && { code: codeData.code }),
          ...(codeData.prefixId && { prefixId: codeData.prefixId }),
        },
      },
    },
  });

  const adminRole = await prisma.projectRole.findFirst({ where: { isAdmin: true } });
  await prisma.projectMember.create({
    data: {
      userId: user.id,
      role: "ADMIN",
      projectId: project.id,
      roleId: adminRole?.id,
    },
  });

  // The creator is the project's first client-visible face. If no alias can be
  // drawn the project still exists — the Aliases page lists them as unaliased
  // and "Assign aliases" fixes it, which is gentler than throwing away a
  // freshly created project. Logged rather than swallowed so the gap is
  // traceable if nobody notices the banner.
  await claimAliasForMember(prisma, {
    userId: user.id,
    projectId: project.id,
    memberRole: "ADMIN",
  }).catch((err: unknown) => {
    console.error("[createProject] creator left unaliased", {
      userId: user.id,
      projectId: project.id,
      error: err instanceof Error ? err.message : err,
    });
  });

  revalidatePath("/dashboard");
  return project;
}

// Lean id+name list for admin dropdowns (e.g. the invite dialog).
export async function getProjectOptions() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") return [];
  return prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getProjects() {
  const user = await requireStaffUser();
  const where = user.systemRole === "ADMIN" ? {} : { members: { some: { userId: user.id } } };
  return prisma.project.findMany({
    where,
    include: {
      team: true,
      contracts: true,
      members: { include: { user: { select: { id: true, name: true, imageUrl: true, email: true } }, projectRole: true } },
      _count: { select: { tasks: true, meetingNotes: true, assets: true, members: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      // The settings overlay initializes its Team dropdown from this —
      // without it the dropdown always showed "No team".
      team: { select: { id: true, name: true } },
      contracts: { orderBy: { startDate: "desc" } },
      members: { include: { user: { select: { id: true, name: true, imageUrl: true, email: true, systemRole: true, excludeFromAlias: true } }, projectRole: true } },
      _count: { select: { tasks: true, meetingNotes: true, assets: true } },
    },
  });

  if (!project) throw new Error("Project not found");
  await requireProjectMember(project.id);
  // Carries the full member roster with real names and emails, and only the
  // staff project pages need it.
  await requireStaffUser();
  return project;
}

export async function updateProject(data: {
  projectId: string;
  name?: string;
  description?: string;
  logoUrl?: string | null;
  teamId?: string | null;
  internalReviewRoleId?: string | null;
  internalReviewUserId?: string | null;
}) {
  await requireProjectRole(data.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  if (data.internalReviewRoleId) {
    const role = await prisma.projectRole.findUnique({
      where: { id: data.internalReviewRoleId },
      select: { id: true },
    });
    if (!role) throw new Error("That role does not exist");
  }

  const updated = await prisma.project.update({
    where: { id: data.projectId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.teamId !== undefined && { teamId: data.teamId || null }),
      ...(data.internalReviewRoleId !== undefined && { internalReviewRoleId: data.internalReviewRoleId }),
      ...(data.internalReviewUserId !== undefined && { internalReviewUserId: data.internalReviewUserId }),
    },
  });

  if (data.name?.trim()) {
    await prisma.conversation.updateMany({
      where: { projectId: data.projectId, kind: CLIENT_CONVERSATION_KIND },
      data: { title: data.name.trim() },
    });
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/messages");
  return updated;
}

/**
 * Refuse a change that would leave a project tracking work nowhere.
 *
 * Sprints and the board are independent systems and either can be switched off,
 * but not both — a project with neither has no Road map, no Active sprint and no
 * Board tab, and no way back except another trip through settings. `turningOff`
 * names the side being switched off; this checks the other side is on.
 */
async function assertOtherSystemRemains(
  projectId: string,
  turningOff: "sprints" | "board",
) {
  const [project, board] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { sprintsEnabled: true },
    }),
    prisma.board.findUnique({
      where: { projectId },
      select: { enabled: true },
    }),
  ]);

  if (turningOff === "sprints" && !board?.enabled) {
    throw new Error(
      "Add a board and switch it on before turning sprints off, or this project would have nowhere to track work.",
    );
  }
  if (turningOff === "board" && !project?.sprintsEnabled) {
    throw new Error(
      "Switch sprints on before hiding the board, or this project would have nowhere to track work.",
    );
  }
}

/**
 * Turn the sprint pipeline on or off for a project.
 *
 * Nothing is deleted either way — this only decides whether the Road map and
 * Active sprint tabs are offered, so a project switched off and back on finds
 * its sprints and tasks untouched. Switching back on is always allowed, which is
 * what makes this recoverable from the UI.
 */
export async function setProjectSprints(data: {
  projectId: string;
  enabled: boolean;
}) {
  await requireProjectMember(data.projectId);
  await requireProjectRole(data.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  if (!data.enabled) await assertOtherSystemRemains(data.projectId, "sprints");

  await prisma.project.update({
    where: { id: data.projectId },
    data: { sprintsEnabled: data.enabled },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/projects");
  return { enabled: data.enabled };
}

/**
 * Show or hide a project's board.
 *
 * The mirror of `setProjectSprints`, and just as non-destructive: hiding leaves
 * every column, card type and card in place, so switching it back on returns the
 * board exactly as it was.
 *
 * Lives here rather than in the board actions because it is a project-level
 * decision — a project admin or manager makes it from project settings, and it
 * is guarded against the same both-off state as sprints. Board roles govern what
 * happens inside a board, not whether the project has one.
 */
export async function setProjectBoard(data: {
  projectId: string;
  enabled: boolean;
}) {
  await requireProjectMember(data.projectId);
  await requireProjectRole(data.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  const board = await prisma.board.findUnique({
    where: { projectId: data.projectId },
    select: { id: true },
  });
  if (!board) throw new Error("This project has no board to show or hide.");

  if (!data.enabled) await assertOtherSystemRemains(data.projectId, "board");

  await prisma.board.update({
    where: { id: board.id },
    data: { enabled: data.enabled },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/projects");
  return { enabled: data.enabled };
}

/** Enable or disable the project's isolated client chat room. */
export async function setProjectClientChat(data: {
  projectId: string;
  enabled: boolean;
}) {
  const { user } = await requireProjectMember(data.projectId);
  await requireProjectRole(data.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  if (data.enabled) {
    await enableClientChat(data.projectId, user.id);
  } else {
    await disableClientChat(data.projectId);
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/messages");
  return { enabled: data.enabled };
}

async function syncClientChatIfEnabled(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientChatEnabled: true },
  });
  if (project?.clientChatEnabled) {
    await syncClientConversationParticipants(projectId).catch(() => {});
  }
}

export async function addContract(data: {
  projectId: string;
  label?: string;
  prefixId?: string;
  contractNumber?: string;
  contractType?: "FULL_TEAM" | "PART_TEAM" | "FIXED" | "MAINTENANCE" | "STARTUP";
  startDate?: string;
  endDate?: string;
}): Promise<{ error?: string }> {
  await requireProjectRole(data.projectId, ["ADMIN"]);

  if (!data.startDate || !data.endDate) return { error: "Start and end dates are required" };
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  const existing = await prisma.contract.findMany({
    where: { projectId: data.projectId },
    select: { id: true, label: true, startDate: true, endDate: true },
  });
  const dateError = validateContractDates(startDate, endDate, existing);
  if (dateError) return { error: dateError };

  let codeData: { code?: string; prefixId?: string } = {};
  if (data.prefixId) {
    codeData = await buildContractCode(data.prefixId, data.contractNumber);
  }

  await prisma.contract.create({
    data: {
      label: data.label,
      contractType: data.contractType ?? "FULL_TEAM",
      startDate,
      endDate,
      projectId: data.projectId,
      ...(codeData.code && { code: codeData.code }),
      ...(codeData.prefixId && { prefixId: codeData.prefixId }),
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return {};
}

export async function deleteContract(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { project: true },
  });
  if (!contract) throw new Error("Contract not found");
  await requireProjectRole(contract.projectId, ["ADMIN"]);

  await prisma.contract.delete({ where: { id: contractId } });
  revalidatePath(`/dashboard/projects/${contract.projectId}`);
}

export async function updateContract(data: {
  contractId: string;
  label?: string;
  contractType?: "FULL_TEAM" | "PART_TEAM" | "FIXED" | "MAINTENANCE" | "STARTUP";
  startDate?: string;
  endDate?: string;
  prefixId?: string;
  contractNumber?: string;
}): Promise<{ error?: string }> {
  const contract = await prisma.contract.findUnique({
    where: { id: data.contractId },
    include: { project: { include: { contracts: true } } },
  });
  if (!contract) return { error: "Contract not found" };
  await requireProjectRole(contract.projectId, ["ADMIN"]);

  const startDate = data.startDate ? new Date(data.startDate) : contract.startDate;
  const endDate = data.endDate ? new Date(data.endDate) : contract.endDate;

  if (startDate && endDate) {
    const existing = contract.project.contracts.map((c) => ({
      id: c.id,
      label: c.label,
      startDate: c.startDate,
      endDate: c.endDate,
    }));

    const dateError = validateContractDates(startDate, endDate, existing, contract.id);
    if (dateError) return { error: dateError };
  }

  let codeData: { code?: string; prefixId?: string } = {};
  if (data.prefixId) {
    codeData = await buildContractCode(data.prefixId, data.contractNumber);
  }

  await prisma.contract.update({
    where: { id: data.contractId },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.contractType && { contractType: data.contractType }),
      startDate,
      endDate,
      ...(codeData.code !== undefined && { code: codeData.code }),
      ...(codeData.prefixId !== undefined && { prefixId: codeData.prefixId }),
    },
  });

  revalidatePath(`/dashboard/projects/${contract.projectId}`);
  return {};
}

export async function toggleLatePayment(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
  });
  if (!contract) throw new Error("Contract not found");
  await requireProjectRole(contract.projectId, ["ADMIN"]);

  await prisma.contract.update({
    where: { id: contractId },
    data: { latePayment: !contract.latePayment },
  });

  revalidatePath(`/dashboard/projects/${contract.projectId}`);
  revalidatePath("/dashboard/projects");
}

export async function inviteMember(data: {
  projectId: string;
  email: string;
  roleId: string;
  name: string;
  gender: Gender;
  excludeFromAlias?: boolean;
}) {
  const { user, canInviteMembers, canInviteClients } = await requireMemberManagement(data.projectId);
  const email = data.email.toLowerCase().trim();
  const name = data.name.trim();
  if (!name) throw new Error("Name is required");
  const gender = parseGender(data.gender);

  const pRole = await prisma.projectRole.findUnique({
    where: { id: data.roleId },
  });
  if (!pRole) {
    throw new Error("Invalid role");
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { systemRole: true } });
  const assigningClient = pRole.isClient || existingUser?.systemRole === "CLIENT";
  const excludeFromAlias = assigningClient || Boolean(data.excludeFromAlias);
  if (assigningClient && !canInviteClients) throw new Error("You don't have permission to invite clients");
  if (!assigningClient && !canInviteMembers) throw new Error("You don't have permission to invite team members");

  // Refuse the invite now rather than letting them sign up and land on the
  // project with no alias to hide behind. Skipped entirely when the mechanism
  // is off, where landing with no alias is the intended outcome.
  if (
    !excludeFromAlias &&
    (await aliasesEnabled(prisma)) &&
    (await availableAliasCount(gender)) === 0
  ) {
    throw new Error(
      `No unused ${gender === "MALE" ? "male" : "female"} aliases left. Upload more in Settings → Aliases.`,
    );
  }

  const invitation = await prisma.invitation.upsert({
    where: { email_projectId: { email, projectId: data.projectId } },
    update: {
      role: membershipRoleFromProjectRole(pRole),
      roleId: data.roleId,
      status: "PENDING",
      invitedById: user.id,
      name,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    create: {
      email,
      name,
      role: membershipRoleFromProjectRole(pRole),
      roleId: data.roleId,
      projectId: data.projectId,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.allowedEmail.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const nameParts = splitDisplayName(name);
  await prisma.pendingTeamInvite.upsert({
    where: { email },
    update: {
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      gender,
      excludeFromAlias,
    },
    create: {
      email,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      systemRole: pRole.isClient ? "CLIENT" : "DEVELOPER",
      gender,
      excludeFromAlias,
    },
  });

  if (pRole.isClient) {
    await rememberClientSignup(email, name, { gender, excludeFromAlias });
    await ensureClientChatForProject(data.projectId, user.id);
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/messages");
  revalidatePath("/dashboard/admin");
  return invitation;
}

export async function getMemberTaskCount(projectId: string, memberId: string) {
  await requireMemberManagement(projectId);

  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    select: { userId: true },
  });
  if (!member) return 0;

  return prisma.task.count({
    where: {
      projectId,
      archivedAt: null,
      OR: [
        { assigneeId: member.userId },
        { createdById: member.userId },
        { developerId: member.userId },
      ],
    },
  });
}

export async function removeMember(data: {
  projectId: string;
  memberId: string;
  transferToUserId?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
  const { user: actingUser, canInviteMembers, canInviteClients } = await requireMemberManagement(data.projectId);

  const member = await prisma.projectMember.findUnique({
    where: { id: data.memberId },
    include: { user: { select: { id: true, systemRole: true, name: true, email: true } } },
  });
  if (!member) return { success: false, error: "Member not found" };

  const targetIsClient = member.user.systemRole === "CLIENT";
  if (targetIsClient && !canInviteClients) return { success: false, error: "You don't have permission to manage clients" };
  if (!targetIsClient && !canInviteMembers) return { success: false, error: "You don't have permission to manage team members" };

  const taskCount = await prisma.task.count({
    where: {
      projectId: data.projectId,
      archivedAt: null,
      OR: [
        { assigneeId: member.userId },
        { createdById: member.userId },
        { developerId: member.userId },
      ],
    },
  });

  if (taskCount > 0 && !data.transferToUserId) {
    return { success: false, error: `TRANSFER_REQUIRED:${taskCount}` };
  }

  if (taskCount > 0 && data.transferToUserId) {
    const targetMember = await prisma.projectMember.findFirst({
      where: { projectId: data.projectId, userId: data.transferToUserId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!targetMember) return { success: false, error: "Transfer target is not a member of this project" };

    // Snapshot the affected tasks before reassigning so each one gets a history entry.
    const affectedTasks = await prisma.task.findMany({
      where: {
        projectId: data.projectId,
        archivedAt: null,
        OR: [
          { assigneeId: member.userId },
          { createdById: member.userId },
          { developerId: member.userId },
        ],
      },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.task.updateMany({
        where: { projectId: data.projectId, assigneeId: member.userId, archivedAt: null },
        data: { assigneeId: data.transferToUserId },
      }),
      prisma.task.updateMany({
        where: { projectId: data.projectId, createdById: member.userId },
        data: { createdById: data.transferToUserId },
      }),
      prisma.task.updateMany({
        where: { projectId: data.projectId, developerId: member.userId, archivedAt: null },
        data: { developerId: data.transferToUserId },
      }),
    ]);

    const removedName = member.user.name ?? member.user.email;
    const targetName = targetMember.user.name ?? targetMember.user.email;
    if (affectedTasks.length > 0) {
      await prisma.taskActivity.createMany({
        data: affectedTasks.map((t) => ({
          taskId: t.id,
          userId: actingUser.id,
          action: "transferred",
          field: "owner",
          oldValue: removedName,
          newValue: targetName,
        })),
      });
    }
  }

  await prisma.projectMember.delete({
    where: { id: data.memberId },
  });

  await demoteClientIfUnneeded(member.userId);
  await syncClientChatIfEnabled(data.projectId);

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/messages");
  return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function updateMemberRole(data: {
  projectId: string;
  memberId: string;
  roleId: string;
}) {
  const { user } = await requireMemberManagement(data.projectId);

  const pRole = await prisma.projectRole.findUnique({
    where: { id: data.roleId },
  });
  if (!pRole) {
    throw new Error("Invalid role");
  }

  const member = await prisma.projectMember.findUnique({
    where: { id: data.memberId },
    select: { userId: true },
  });
  if (!member) throw new Error("Member not found");

  // Moving a client seat to a staff one turns this person into someone the
  // client can see, so they need an alias. Checked before anything is written,
  // the way invites are: the claim itself can only run after the demotion
  // below, and refusing the change is better than committing it and finding out.
  if (!pRole.isClient) {
    await requireClaimableAlias(member.userId, data.projectId);
  }

  const memberRole = membershipRoleFromProjectRole(pRole);
  await prisma.projectMember.update({
    where: { id: data.memberId },
    data: {
      role: memberRole,
      roleId: data.roleId,
      ...(pRole.isClient && {
        canInviteMembers: false,
        canInviteClients: false,
        canBypassProof: false,
      }),
    },
  });

  if (pRole.isClient) {
    await promoteUserToClient(member.userId);
    await ensureClientChatForProject(data.projectId, user.id);
  } else {
    // Clears the CLIENT system role first, or the claim would read them as a
    // client and skip — leaving a staff seat with no alias behind it.
    await demoteClientIfUnneeded(member.userId);
    await claimAliasForMember(prisma, {
      userId: member.userId,
      projectId: data.projectId,
      memberRole,
    });
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/messages");
}

export async function addMemberToProject(data: {
  projectId: string;
  userId: string;
  roleId: string;
}) {
  const { user, canInviteMembers, canInviteClients } = await requireMemberManagement(data.projectId);

  const pRole = await prisma.projectRole.findUnique({ where: { id: data.roleId } });
  if (!pRole) throw new Error("Invalid role");

  if (data.userId.startsWith("pending:")) {
    const inviteId = data.userId.replace("pending:", "");
    const pendingInvite = await prisma.pendingTeamInvite.findUnique({ where: { id: inviteId } });
    if (!pendingInvite) throw new Error("Pending invite not found");
    const assigningClient = pRole.isClient || pendingInvite.systemRole === "CLIENT";
    if (assigningClient && !canInviteClients) throw new Error("You don't have permission to invite clients");
    if (!assigningClient && !canInviteMembers) throw new Error("You don't have permission to invite team members");

    const pendingName = joinDisplayName(pendingInvite.firstName, pendingInvite.lastName) || null;

    await prisma.invitation.upsert({
      where: { email_projectId: { email: pendingInvite.email, projectId: data.projectId } },
      update: {
        role: membershipRoleFromProjectRole(pRole),
        roleId: data.roleId,
        status: "PENDING",
        invitedById: user.id,
        ...(pendingName ? { name: pendingName } : {}),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      create: {
        email: pendingInvite.email,
        name: pendingName,
        role: membershipRoleFromProjectRole(pRole),
        roleId: data.roleId,
        projectId: data.projectId,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    if (pRole.isClient) {
      await rememberClientSignup(pendingInvite.email, pendingName ?? undefined, {
        gender: pendingInvite.gender,
        excludeFromAlias: pendingInvite.excludeFromAlias,
      });
      await ensureClientChatForProject(data.projectId, user.id);
    }

    revalidatePath(`/dashboard/projects/${data.projectId}`);
    revalidatePath("/dashboard/messages");
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id: data.userId }, select: { systemRole: true } });
  if (!targetUser) throw new Error("User not found");
  const assigningClient = pRole.isClient || targetUser.systemRole === "CLIENT";
  if (assigningClient && !canInviteClients) throw new Error("You don't have permission to invite clients");
  if (!assigningClient && !canInviteMembers) throw new Error("You don't have permission to invite team members");

  const existing = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: data.userId, projectId: data.projectId } },
  });
  if (existing) throw new Error("User is already a member of this project");

  // Membership and alias are claimed together: a member who joins without an
  // alias would show their real name to the client the moment they post.
  const memberRole = membershipRoleFromProjectRole(pRole);
  await prisma.$transaction(async (tx) => {
    await tx.projectMember.create({
      data: {
        userId: data.userId,
        projectId: data.projectId,
        role: memberRole,
        roleId: data.roleId,
      },
    });
    await claimAliasForMember(tx, {
      userId: data.userId,
      projectId: data.projectId,
      memberRole,
    });
  });

  if (pRole.isClient) {
    await promoteUserToClient(data.userId);
    await ensureClientChatForProject(data.projectId, user.id);
  } else {
    await syncClientChatIfEnabled(data.projectId);
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/messages");
}

export async function getAvailableUsers(projectId: string) {
  const [existingMembers, existingInvites] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
    prisma.invitation.findMany({ where: { projectId, status: "PENDING" }, select: { email: true } }),
  ]);
  const memberIds = new Set(existingMembers.map((m) => m.userId));
  const invitedEmails = new Set(existingInvites.map((i) => i.email));

  const [allUsers, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      where: { blocked: false },
      select: { id: true, name: true, email: true, imageUrl: true, systemRole: true },
      orderBy: { name: "asc" },
    }),
    prisma.pendingTeamInvite.findMany({
      select: { id: true, email: true, systemRole: true, firstName: true, lastName: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const users = allUsers
    .filter((u) => !memberIds.has(u.id))
    .map((u) => ({ ...u, isClient: u.systemRole === "CLIENT", pending: false as const }));

  const pendingUsers = pendingInvites
    .filter((p) => !invitedEmails.has(p.email) && !allUsers.some((u) => u.email === p.email))
    .map((p) => ({
      id: `pending:${p.id}`,
      name: joinDisplayName(p.firstName, p.lastName) || null,
      email: p.email,
      imageUrl: null as string | null,
      isClient: p.systemRole === "CLIENT",
      pending: true as const,
    }));

  return [...users, ...pendingUsers];
}

export async function deleteProject(data: {
  projectId: string;
  confirmName: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });
  if (!project) throw new Error("Project not found");
  if (data.confirmName !== project.name) {
    throw new Error("Project name does not match");
  }

  await requireProjectRole(data.projectId, ["ADMIN"]);

  await prisma.project.delete({ where: { id: data.projectId } });
  revalidatePath("/dashboard");
}

export async function getProjectMembers(projectId: string) {
  await requireProjectMember(projectId);
  await requireStaffUser();
  return prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          email: true,
          systemRole: true,
          excludeFromAlias: true,
        },
      },
      projectRole: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getProjectInvitations(projectId: string) {
  await requireProjectMember(projectId);

  return prisma.invitation.findMany({
    where: { projectId, status: "PENDING" },
    include: {
      invitedBy: { select: { id: true, name: true, imageUrl: true } },
      projectRole: { select: { id: true, name: true, isAdmin: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function cancelInvitation(data: {
  projectId: string;
  invitationId: string;
}): Promise<{ ok: true }> {
  await requireMemberManagement(data.projectId);

  const invitation = await prisma.invitation.findFirst({
    where: { id: data.invitationId, projectId: data.projectId },
    select: { id: true, email: true, role: true },
  });

  if (invitation) {
    await prisma.invitation.delete({ where: { id: invitation.id } });
    if (invitation.role === "CLIENT") {
      await forgetClientSignupIfUnused(invitation.email);
    }
    await removeFromAllowlistIfUnused(invitation.email);
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return { ok: true };
}

export async function updateInvitationName(data: {
  projectId: string;
  invitationId: string;
  name: string;
}): Promise<{ ok: true } | { error: string }> {
  await requireMemberManagement(data.projectId);
  const trimmed = data.name.trim();
  if (!trimmed) return { error: "Name is required" };

  const invitation = await prisma.invitation.findFirst({
    where: { id: data.invitationId, projectId: data.projectId, status: "PENDING" },
    select: { id: true, email: true },
  });
  if (!invitation) return { error: "Invitation not found" };

  await syncInviteDisplayName(invitation.email, trimmed);

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/admin");
  return { ok: true };
}

export async function updateMemberName(data: {
  projectId: string;
  memberId: string;
  name: string;
}): Promise<{ ok: true } | { error: string }> {
  await requireMemberManagement(data.projectId);
  const trimmed = data.name.trim();
  if (!trimmed) return { error: "Name is required" };

  const member = await prisma.projectMember.findFirst({
    where: { id: data.memberId, projectId: data.projectId },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!member) return { error: "Member not found" };

  await prisma.user.update({
    where: { id: member.userId },
    data: { name: trimmed },
  });
  await syncInviteDisplayName(member.user.email, trimmed);

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/account");
  return { ok: true };
}

export async function updateMemberInvitePerms(data: {
  projectId: string;
  memberId: string;
  canInviteMembers?: boolean;
  canInviteClients?: boolean;
  canBypassProof?: boolean;
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  const isSystemAdmin = user.systemRole === "ADMIN";
  const isProjectAdmin = member.projectRole?.isAdmin ?? false;
  if (!isSystemAdmin && !isProjectAdmin) throw new Error("Only admins can manage invite permissions");

  const target = await prisma.projectMember.findFirst({
    where: { id: data.memberId, projectId: data.projectId },
    select: { role: true, projectRole: { select: { isClient: true } } },
  });
  if (target?.role === "CLIENT" || target?.projectRole?.isClient) {
    throw new Error("Client members cannot invite or bypass");
  }

  await prisma.projectMember.update({
    where: { id: data.memberId },
    data: {
      ...(data.canInviteMembers !== undefined && { canInviteMembers: data.canInviteMembers }),
      ...(data.canInviteClients !== undefined && { canInviteClients: data.canInviteClients }),
      ...(data.canBypassProof !== undefined && { canBypassProof: data.canBypassProof }),
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}

/**
 * Show one member to this project's client under their real name, or put them
 * back behind their alias. Scoped to this membership, so their aliases on other
 * projects are untouched, and independent of the account-wide
 * `User.excludeFromAlias`.
 *
 * Going back behind an alias has to leave them with one, so it runs the same
 * preflight as seating a new member and claims inside the flag's transaction —
 * an empty pool rolls the whole thing back rather than leaving the client
 * reading a real name. That refusal is returned rather than thrown, since the
 * admin flipping the switch is the one who has to go and fix the pool.
 */
export async function setMemberRealName(data: {
  projectId: string;
  memberId: string;
  showRealName: boolean;
}): Promise<{ success: true } | { error: string }> {
  const { user, member } = await requireProjectMember(data.projectId);
  const isSystemAdmin = user.systemRole === "ADMIN";
  const isProjectAdmin = member.projectRole?.isAdmin ?? false;
  if (!isSystemAdmin && !isProjectAdmin) {
    throw new Error("Only admins can manage alias visibility");
  }

  const target = await prisma.projectMember.findFirst({
    where: { id: data.memberId, projectId: data.projectId },
    select: {
      userId: true,
      role: true,
      showRealName: true,
      projectRole: { select: { isClient: true } },
    },
  });
  if (!target) throw new Error("Member not found");
  if (target.role === "CLIENT" || target.projectRole?.isClient) {
    throw new Error("Client members are the ones reading the aliases");
  }
  if (target.showRealName === data.showRealName) return { success: true };

  if (data.showRealName) {
    // The assignment they may already hold stays put — an alias is never handed
    // to anyone else, so the same one returns if this is switched back off.
    await prisma.projectMember.update({
      where: { id: data.memberId },
      data: { showRealName: true },
    });
  } else {
    try {
      // Judged as if the switch were already off, since that is what is about
      // to be true — the membership still says otherwise at this point.
      await requireClaimableAlias(target.userId, data.projectId, false);
      await prisma.$transaction(async (tx) => {
        await tx.projectMember.update({
          where: { id: data.memberId },
          data: { showRealName: false },
        });
        // After the update, never before: the claim reads this flag and would
        // treat them as exempt while it still said true.
        await claimAliasForMember(tx, {
          userId: target.userId,
          projectId: data.projectId,
          memberRole: target.role,
        });
      });
    } catch (err) {
      if (isAliasBlocked(err)) return { error: err.message };
      throw err;
    }
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return { success: true };
}
