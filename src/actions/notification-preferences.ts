"use server";

// Notifications are mandatory. The per-type / sound preference actions that
// used to live here were removed together with the settings UI so there is no
// remaining path (UI or callable server action) to opt out. Per-thread mutes
// are the one opt-out that stays.

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** threadKey: "task-{id}" | "conv-{id}" | "project-{id}" */
export async function setThreadMuted(
  threadKey: string,
  muted: boolean,
): Promise<void> {
  const user = await requireUser();
  if (!/^(task|conv|project)-[\w-]+$/.test(threadKey)) {
    throw new Error("Invalid thread key");
  }

  if (muted) {
    await prisma.mutedThread.upsert({
      where: { userId_threadKey: { userId: user.id, threadKey } },
      create: { userId: user.id, threadKey },
      update: {},
    });
  } else {
    await prisma.mutedThread.deleteMany({
      where: { userId: user.id, threadKey },
    });
  }
}

export async function getMyMutedThreads(): Promise<string[]> {
  const user = await requireUser();
  const rows = await prisma.mutedThread.findMany({
    where: { userId: user.id },
    select: { threadKey: true },
  });
  return rows.map((r) => r.threadKey);
}

export async function isThreadMuted(threadKey: string): Promise<boolean> {
  const user = await requireUser();
  const row = await prisma.mutedThread.findUnique({
    where: { userId_threadKey: { userId: user.id, threadKey } },
    select: { id: true },
  });
  return Boolean(row);
}
