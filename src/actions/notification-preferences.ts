"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  DEFAULT_PREFERENCES,
  type PreferenceFlags,
} from "@/lib/notification-prefs";

export type NotificationPreferencesDTO = PreferenceFlags;

export async function getMyNotificationPreferences(): Promise<NotificationPreferencesDTO> {
  const user = await requireUser();
  const row = await prisma.notificationPreference.findUnique({
    where: { userId: user.id },
  });
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    notifyMessages: row.notifyMessages,
    notifyMentions: row.notifyMentions,
    notifyRejections: row.notifyRejections,
    notifyDeadlines: row.notifyDeadlines,
    soundEnabled: row.soundEnabled,
  };
}

export async function updateMyNotificationPreferences(
  patch: Partial<NotificationPreferencesDTO>,
): Promise<NotificationPreferencesDTO> {
  const user = await requireUser();

  const data: Partial<NotificationPreferencesDTO> = {};
  if (typeof patch.notifyMessages === "boolean") data.notifyMessages = patch.notifyMessages;
  if (typeof patch.notifyMentions === "boolean") data.notifyMentions = patch.notifyMentions;
  if (typeof patch.notifyRejections === "boolean") data.notifyRejections = patch.notifyRejections;
  if (typeof patch.notifyDeadlines === "boolean") data.notifyDeadlines = patch.notifyDeadlines;
  if (typeof patch.soundEnabled === "boolean") data.soundEnabled = patch.soundEnabled;

  const row = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  return {
    notifyMessages: row.notifyMessages,
    notifyMentions: row.notifyMentions,
    notifyRejections: row.notifyRejections,
    notifyDeadlines: row.notifyDeadlines,
    soundEnabled: row.soundEnabled,
  };
}

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
