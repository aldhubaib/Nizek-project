"use server";

// Notifications are mandatory. The per-type / sound preference actions that
// used to live here were removed together with the settings UI so there is no
// remaining path (UI or callable server action) to opt out. The per-thread
// level — every message / mentions only / off — is the one choice that stays.

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  defaultThreadLevel,
  isThreadNotificationLevel,
  type ThreadNotificationLevel,
} from "@/lib/notification-prefs";

const THREAD_KEY_RE = /^(task|conv|project)-[\w-]+$/;

export type ThreadNotificationSetting = {
  /** What applies right now (stored choice or the thread's default). */
  level: ThreadNotificationLevel;
  /** What the thread does when nothing is chosen. */
  defaultLevel: ThreadNotificationLevel;
  /** True when the person picked something themselves. */
  stored: boolean;
};

/** threadKey: "task-{id}" | "conv-{id}" | "project-{id}" */
export async function setThreadNotificationLevel(
  threadKey: string,
  level: ThreadNotificationLevel,
): Promise<ThreadNotificationSetting> {
  const user = await requireUser();
  if (!THREAD_KEY_RE.test(threadKey)) throw new Error("Invalid thread key");
  if (!isThreadNotificationLevel(level)) throw new Error("Invalid level");

  const defaultLevel = defaultThreadLevel(threadKey);
  if (level === defaultLevel) {
    // Choosing the default again means "no preference": drop the row so a
    // future change of defaults applies to this person too.
    await prisma.threadNotificationPref.deleteMany({
      where: { userId: user.id, threadKey },
    });
    return { level, defaultLevel, stored: false };
  }
  await prisma.threadNotificationPref.upsert({
    where: { userId_threadKey: { userId: user.id, threadKey } },
    create: { userId: user.id, threadKey, level },
    update: { level },
  });
  return { level, defaultLevel, stored: true };
}

export async function getThreadNotificationLevel(
  threadKey: string,
): Promise<ThreadNotificationSetting> {
  const user = await requireUser();
  const defaultLevel = defaultThreadLevel(threadKey);
  if (!THREAD_KEY_RE.test(threadKey)) return { level: defaultLevel, defaultLevel, stored: false };
  const row = await prisma.threadNotificationPref.findUnique({
    where: { userId_threadKey: { userId: user.id, threadKey } },
    select: { level: true },
  });
  const level = row && isThreadNotificationLevel(row.level) ? row.level : defaultLevel;
  return { level, defaultLevel, stored: Boolean(row) };
}

/** Thread keys this person set to "none" — for a muted icon in lists. */
export async function getMySilencedThreads(): Promise<string[]> {
  const user = await requireUser();
  const rows = await prisma.threadNotificationPref.findMany({
    where: { userId: user.id, level: "none" },
    select: { threadKey: true },
  });
  return rows.map((r) => r.threadKey);
}
