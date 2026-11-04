import "server-only";
import { getRedis } from "@/lib/redis";
import {
  ACTIVE_THREAD_TTL_SECONDS,
  activeThreadRedisKey,
} from "@/lib/push-core";

/**
 * Records which thread one device is looking at right now. The push worker
 * reads this (push-core.ts `partitionByActiveThread`) to skip exactly that
 * device, so the OS banner never has to be suppressed client-side — which is
 * what got iOS installs their push permission revoked.
 *
 * Best effort on purpose: Redis being down must never fail the page. The
 * worst case is one extra banner on the device that is already reading.
 */
export async function setActiveThread(
  userId: string,
  deviceId: string,
  threadKey: string | null,
): Promise<void> {
  const key = activeThreadRedisKey(userId, deviceId);
  try {
    if (threadKey) {
      await getRedis().set(key, threadKey, "EX", ACTIVE_THREAD_TTL_SECONDS);
    } else {
      await getRedis().del(key);
    }
  } catch (err) {
    console.error(
      "[active-thread] redis write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
