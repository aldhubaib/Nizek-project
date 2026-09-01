"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  BoardAccessError,
  requireBoardAction,
  requireBoardActionForRole,
  runBoardAction,
  type BoardResult,
} from "@/lib/board-access";
import type { BoardPermissions } from "@/lib/board-permissions";

/**
 * Roles and membership, both scoped to a single board.
 *
 * `ProjectRole` is not reused and not consulted. It is built around the sprint
 * pipeline — `allowedTransitions` keyed by `Stage` names, flags for starting
 * and ending sprints — none of which describes a board. The only thing the two
 * share is who is on the project, which is where board membership is drawn
 * from: you can only be given a board role if you are already on the project
 * holding the board.
 */

export interface BoardRoleDTO extends BoardPermissions {
  id: string;
  name: string;
  isDefault: boolean;
  memberCount: number;
}

export interface BoardMemberDTO {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
  roleId: string;
  roleName: string;
}

export interface BoardCandidateDTO {
  userId: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
}

export interface BoardSettingsDTO {
  roles: BoardRoleDTO[];
  members: BoardMemberDTO[];
  /** Project members with no board role yet, who therefore sit on the default. */
  candidates: BoardCandidateDTO[];
}

export async function getBoardSettings(boardId: string): Promise<BoardSettingsDTO | null> {
  let context;
  try {
    context = await requireBoardAction(boardId, "manageMembers");
  } catch {
    return null;
  }

  const [roles, members, projectMembers] = await Promise.all([
    prisma.boardRole.findMany({
      where: { boardId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { members: true } } },
    }),
    prisma.boardMember.findMany({
      where: { boardId },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
        role: { select: { id: true, name: true } },
      },
    }),
    prisma.projectMember.findMany({
      where: { projectId: context.board.projectId },
      include: { user: { select: { id: true, name: true, email: true, imageUrl: true, systemRole: true } } },
    }),
  ]);

  const assigned = new Set(members.map((member) => member.userId));

  return {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      isDefault: role.isDefault,
      isAdmin: role.isAdmin,
      canManageColumns: role.canManageColumns,
      canManageTypes: role.canManageTypes,
      canManageMembers: role.canManageMembers,
      canCreateCard: role.canCreateCard,
      canEditCard: role.canEditCard,
      canDeleteCard: role.canDeleteCard,
      canMoveCard: role.canMoveCard,
      canComment: role.canComment,
      memberCount: role._count.members,
    })),
    members: members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      imageUrl: member.user.imageUrl,
      roleId: member.role.id,
      roleName: member.role.name,
    })),
    candidates: projectMembers
      .filter((member) => !assigned.has(member.userId))
      // Clients are kept off boards entirely for now, so offering them a role
      // would promise something `board-access.ts` refuses.
      .filter((member) => member.user.systemRole !== "CLIENT")
      .map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        imageUrl: member.user.imageUrl,
      })),
  };
}

const FLAG_KEYS = [
  "isAdmin",
  "canManageColumns",
  "canManageTypes",
  "canManageMembers",
  "canCreateCard",
  "canEditCard",
  "canDeleteCard",
  "canMoveCard",
  "canComment",
] as const;

/**
 * Only the flags the caller actually stated, so a partial update leaves the
 * rest alone instead of silently resetting them to false.
 */
function flagsFrom(input: Partial<BoardPermissions>): Partial<BoardPermissions> {
  const flags: Partial<BoardPermissions> = {};
  for (const key of FLAG_KEYS) {
    if (input[key] !== undefined) flags[key] = Boolean(input[key]);
  }
  return flags;
}

export async function createBoardRole(input: {
  boardId: string;
  name: string;
  permissions: Partial<BoardPermissions>;
}): Promise<BoardResult<{ id: string }>> {
  return runBoardAction(async () => {
    const context = await requireBoardAction(input.boardId, "manageMembers");

    const name = input.name.trim();
    if (!name) throw new BoardAccessError("A role needs a name.");

    const clash = await prisma.boardRole.findFirst({
      where: { boardId: input.boardId, name },
      select: { id: true },
    });
    if (clash) throw new BoardAccessError(`This board already has a role called "${name}".`);

    const role = await prisma.boardRole.create({
      data: { boardId: input.boardId, name, ...flagsFrom(input.permissions) },
      select: { id: true },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return role;
  });
}

export async function updateBoardRole(input: {
  roleId: string;
  name?: string;
  permissions?: Partial<BoardPermissions>;
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context, boardId } = await requireBoardActionForRole(input.roleId, "manageMembers");

    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BoardAccessError("A role needs a name.");
    }

    if (name) {
      const clash = await prisma.boardRole.findFirst({
        where: { boardId, name, id: { not: input.roleId } },
        select: { id: true },
      });
      if (clash) throw new BoardAccessError(`This board already has a role called "${name}".`);
    }

    const next = { ...(name ? { name } : {}), ...flagsFrom(input.permissions ?? {}) };

    // Removing the last admin would leave the board configurable by nobody but
    // a system admin. Refused here so the person doing it finds out now.
    if (next.isAdmin === false) {
      const otherAdmins = await prisma.boardRole.count({
        where: { boardId, isAdmin: true, id: { not: input.roleId } },
      });
      if (otherAdmins === 0) {
        throw new BoardAccessError("A board needs at least one admin role.");
      }
    }

    await prisma.boardRole.update({ where: { id: input.roleId }, data: next });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

/**
 * Which role catches everyone on the project who was never given one.
 *
 * Exactly one per board, which the migration enforces with a partial unique
 * index — so the old default has to be cleared in the same transaction that
 * sets the new one.
 */
export async function setDefaultBoardRole(roleId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context, boardId } = await requireBoardActionForRole(roleId, "manageMembers");

    await prisma.$transaction([
      prisma.boardRole.updateMany({
        where: { boardId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.boardRole.update({ where: { id: roleId }, data: { isDefault: true } }),
    ]);

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

export async function deleteBoardRole(roleId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context, boardId } = await requireBoardActionForRole(roleId, "manageMembers");

    const role = await prisma.boardRole.findUnique({
      where: { id: roleId },
      select: { isDefault: true, isAdmin: true, _count: { select: { members: true } } },
    });
    if (!role) throw new BoardAccessError("That role no longer exists.");

    if (role._count.members > 0) {
      throw new BoardAccessError(
        `${role._count.members} ${role._count.members === 1 ? "person holds" : "people hold"} that role. Move them to another one first.`,
      );
    }
    if (role.isDefault) {
      throw new BoardAccessError("Make another role the default before deleting this one.");
    }
    if (role.isAdmin) {
      const otherAdmins = await prisma.boardRole.count({
        where: { boardId, isAdmin: true, id: { not: roleId } },
      });
      if (otherAdmins === 0) {
        throw new BoardAccessError("A board needs at least one admin role.");
      }
    }

    await prisma.boardRole.delete({ where: { id: roleId } });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

// ─── Membership ──────────────────────────────────────────────────────────────

export async function setBoardMemberRole(input: {
  boardId: string;
  userId: string;
  roleId: string;
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const context = await requireBoardAction(input.boardId, "manageMembers");

    // Membership is drawn from the project. Someone not on it cannot be given a
    // board role, because the outer gate would refuse them anyway.
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: input.userId, projectId: context.board.projectId },
      },
      select: { user: { select: { systemRole: true } } },
    });
    if (!projectMember) throw new BoardAccessError("That person is not on this project.");
    if (projectMember.user.systemRole === "CLIENT") {
      throw new BoardAccessError("Boards are not available to client accounts.");
    }

    const role = await prisma.boardRole.findFirst({
      where: { id: input.roleId, boardId: input.boardId },
      select: { id: true },
    });
    if (!role) throw new BoardAccessError("That role is not on this board.");

    await prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: input.boardId, userId: input.userId } },
      create: { boardId: input.boardId, userId: input.userId, roleId: input.roleId },
      update: { roleId: input.roleId },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

/** Drops the explicit role; the person falls back to the board's default. */
export async function removeBoardMember(input: {
  boardId: string;
  userId: string;
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const context = await requireBoardAction(input.boardId, "manageMembers");

    await prisma.boardMember.deleteMany({
      where: { boardId: input.boardId, userId: input.userId },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}
