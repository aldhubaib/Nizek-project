import "server-only";
import { prisma } from "@/lib/prisma";
import { ALL_MENTION_ID } from "@/lib/mentions";

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export type ProjectMentionMember = {
  id: string;
  name: string | null;
  email: string;
};

export async function getProjectMentionMembers(
  projectId: string,
): Promise<ProjectMentionMember[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return members.map((m) => m.user);
}

export async function requireUserOnProject(projectId: string, userId: string) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: {
      user: { select: { id: true, name: true, imageUrl: true, systemRole: true } },
    },
  });
  if (!member) throw new Error("That person is not on this project");
  return member.user;
}

function parseMentionIds(body: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "g");
  while ((match = re.exec(body)) !== null) {
    ids.add(match[2]);
  }
  return [...ids];
}

/**
 * Resolve @[all](__all__) and individual mention tokens to project member ids.
 *
 * Clients are project members but every surface this feeds — internal project
 * chat, task threads, note and highlight comments — 404s for them, so they are
 * dropped here. Their own room does its own mention parsing against the people
 * actually in it. Without this, @all on a sprint announcement pushes a banner
 * to a client that dead-ends the moment they tap it.
 */
export async function resolveProjectMentionIds(
  body: string,
  projectId: string | null,
): Promise<string[]> {
  const raw = parseMentionIds(body);
  const expandAll = raw.includes(ALL_MENTION_ID);
  const ids = raw.filter((id) => id !== ALL_MENTION_ID);
  if (!projectId) return ids;

  const members = await prisma.projectMember.findMany({
    where: { projectId, user: { systemRole: { not: "CLIENT" } } },
    select: { userId: true },
  });
  const allowed = new Set(members.map((m) => m.userId));
  const mentioned = ids.filter((id) => allowed.has(id));
  if (!expandAll) return mentioned;
  return [...new Set([...mentioned, ...allowed])];
}
