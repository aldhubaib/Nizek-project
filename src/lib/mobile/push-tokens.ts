import "server-only";
import { prisma } from "@/lib/prisma";
import {
  isExpoPushTokenString,
  isMobilePlatform,
  isValidDeviceId,
  type MobilePlatform,
} from "@/lib/mobile-push-core";

export interface RegisterTokenInput {
  token: string;
  deviceId: string;
  platform: MobilePlatform;
  deviceName?: string | null;
  appVersion?: string | null;
}

export function parseRegisterTokenInput(body: unknown): RegisterTokenInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isExpoPushTokenString(b.token)) throw new Error("Invalid push token");
  if (!isValidDeviceId(b.deviceId)) throw new Error("Invalid device id");
  if (!isMobilePlatform(b.platform)) throw new Error("Invalid platform");
  return {
    token: b.token,
    deviceId: b.deviceId,
    platform: b.platform,
    deviceName: typeof b.deviceName === "string" ? b.deviceName.slice(0, 120) : null,
    appVersion: typeof b.appVersion === "string" ? b.appVersion.slice(0, 40) : null,
  };
}

/**
 * Saves (or refreshes) one phone's push token for the signed-in person.
 *
 * - A token is unique to one install, so it is re-pointed at whoever is signed
 *   in now (shared phone, account switch) and its failure history reset.
 * - One install has one token at a time: older tokens for the same device id
 *   are dropped so a rotated token does not leave a dead twin behind.
 */
export async function registerMobilePushToken(
  memberId: string,
  input: RegisterTokenInput,
): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.mobilePushToken.deleteMany({
      where: { deviceId: input.deviceId, token: { not: input.token } },
    }),
    prisma.mobilePushToken.upsert({
      where: { token: input.token },
      create: {
        memberId,
        token: input.token,
        deviceId: input.deviceId,
        platform: input.platform,
        deviceName: input.deviceName,
        appVersion: input.appVersion,
        lastSeenAt: now,
      },
      update: {
        memberId,
        deviceId: input.deviceId,
        platform: input.platform,
        deviceName: input.deviceName,
        appVersion: input.appVersion,
        failCount: 0,
        lastError: null,
        lastSeenAt: now,
      },
    }),
  ]);
}

/** Sign-out: this install must stop receiving this person's pushes. */
export async function unregisterMobilePushToken(
  memberId: string,
  input: { token?: unknown; deviceId?: unknown },
): Promise<number> {
  const or: { token?: string; deviceId?: string }[] = [];
  if (isExpoPushTokenString(input.token)) or.push({ token: input.token });
  if (isValidDeviceId(input.deviceId)) or.push({ deviceId: input.deviceId });
  if (or.length === 0) return 0;
  const res = await prisma.mobilePushToken.deleteMany({
    where: { memberId, OR: or },
  });
  return res.count;
}
