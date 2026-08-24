"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { invalidateBrandingCache, NOTIFICATION_SOUND_SLOT } from "@/lib/branding";
import { generateR2Key, uploadToR2, deleteFromR2 } from "@/lib/r2";
import { publish } from "@/lib/centrifugo";
import { globalPresenceChannel, NOTIFICATION_SOUND_EVENT } from "@/lib/channels";

async function announceSoundChange(url: string | null): Promise<void> {
  try {
    await publish(globalPresenceChannel(), {
      type: NOTIFICATION_SOUND_EVENT,
      url,
    });
  } catch {
    /* best-effort — clients still pick it up on next focus/reload */
  }
}

const MAX_NOTIFICATION_SOUND_BYTES = 3 * 1024 * 1024; // 3 MB — keep it short.
const ALLOWED_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
];

export type NotificationSoundDTO = {
  url: string;
  name: string;
  size: number;
  updatedAt: number;
} | null;

async function requireAdmin() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Permission denied");
  return user;
}

export async function getNotificationSound(): Promise<NotificationSoundDTO> {
  await requireAdmin();
  const row = await prisma.brandingAsset.findUnique({
    where: { slot: NOTIFICATION_SOUND_SLOT },
  });
  if (!row) return null;
  return {
    url: row.url,
    name: row.fileName,
    size: row.size,
    updatedAt: row.updatedAt.getTime(),
  };
}

/**
 * Fresh (uncached) current sound URL for any signed-in user. Clients call this
 * on mount and on tab focus so they always converge to the latest sound even if
 * a cached layout render or another replica served a stale URL.
 */
export async function getActiveNotificationSoundUrl(): Promise<string | null> {
  const session = await getSession();
  if (!session?.user) return null;
  const row = await prisma.brandingAsset.findUnique({
    where: { slot: NOTIFICATION_SOUND_SLOT },
    select: { url: true },
  });
  return row?.url ?? null;
}

export async function setNotificationSound(formData: FormData): Promise<void> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");
  if (file.size === 0) throw new Error("File is empty");
  if (file.size > MAX_NOTIFICATION_SOUND_BYTES)
    throw new Error("Audio is too large (max 3 MB)");

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.includes(mime))
    throw new Error("Unsupported audio format. Use MP3, WAV, OGG, or M4A.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = generateR2Key("notification_sound", file.name || "sound.mp3");
  const url = await uploadToR2(bytes, key, mime);

  const existing = await prisma.brandingAsset.findUnique({
    where: { slot: NOTIFICATION_SOUND_SLOT },
  });

  await prisma.brandingAsset.upsert({
    where: { slot: NOTIFICATION_SOUND_SLOT },
    create: {
      slot: NOTIFICATION_SOUND_SLOT,
      url,
      r2Key: key,
      contentType: mime,
      fileName: file.name || "notification-sound",
      width: 0,
      height: 0,
      size: file.size,
    },
    update: {
      url,
      r2Key: key,
      contentType: mime,
      fileName: file.name || "notification-sound",
      size: file.size,
    },
  });

  if (existing) await deleteFromR2(existing.r2Key).catch(() => {});
  invalidateBrandingCache();
  await announceSoundChange(url);
}

export async function removeNotificationSound(): Promise<void> {
  await requireAdmin();
  const existing = await prisma.brandingAsset.findUnique({
    where: { slot: NOTIFICATION_SOUND_SLOT },
  });
  if (existing) {
    await prisma.brandingAsset.delete({ where: { slot: NOTIFICATION_SOUND_SLOT } });
    await deleteFromR2(existing.r2Key).catch(() => {});
  }
  invalidateBrandingCache();
  await announceSoundChange(null);
}
