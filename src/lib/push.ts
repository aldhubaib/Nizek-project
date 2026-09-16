import "server-only";
import type { PushPayload } from "@/lib/push-core";

export type { PushPayload };

// Sending happens exclusively in the worker (src/lib/push/delivery.ts) via the
// transactional outbox in notify.ts / push-queue.ts. The web app only needs to
// know whether push is configured at all, for UI and health reporting.

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

const configured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (!configured) {
  console.warn(
    "[push] VAPID keys missing (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — web push is DISABLED",
  );
}

export function isPushConfigured(): boolean {
  return configured;
}
