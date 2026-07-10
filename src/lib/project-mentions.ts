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
  const [members, admins] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { systemRole: "ADMIN" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const map = new Map<string, ProjectMentionMember>();
  for (const m of members) map.set(m.user.id, m.user);
  for (const a of admins) map.set(a.id, a);
  return [...map.values()];
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

/** Resolve @[all](__all__) and individual mention tokens to member ids. */
export async function resolveProjectMentionIds(
  body: string,
  projectId: string | null,
): Promise<string[]> {
  const ids = parseMentionIds(body);
  if (!ids.includes(ALL_MENTION_ID) || !projectId) {
    return ids.filter((id) => id !== ALL_MENTION_ID);
  }

  const members = await getProjectMentionMembers(projectId);
  const memberIds = members.map((m) => m.id);
  return [...new Set([...ids.filter((id) => id !== ALL_MENTION_ID), ...memberIds])];
}
