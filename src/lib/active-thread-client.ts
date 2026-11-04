// Browser side of the active-thread heartbeat (see src/lib/active-thread.ts).
// While a thread is open and visible this device tells the server which thread
// it is reading, every ACTIVE_THREAD_HEARTBEAT_MS. The push worker then skips
// this one device for that thread, so the service worker can show every push
// it receives without iOS counting any of them as silent.

import { getDeviceId } from "@/lib/device-id";
import { ACTIVE_THREAD_HEARTBEAT_MS } from "@/lib/push-core";

const ENDPOINT = "/api/presence/active";

function post(deviceId: string, threadKey: string | null): void {
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, threadKey }),
      // The clearing call usually races navigation / tab close; keepalive lets
      // it finish after the page is gone.
      keepalive: threadKey === null,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* fetch unavailable (SSR, extensions) — the TTL expires the key anyway */
  }
}

/**
 * Starts heartbeating `threadKey` ("conv-…" / "project-…" / "task-…") while
 * the document is visible, pauses and clears it while hidden, and clears it
 * when the returned stop function runs (thread closed / navigated away).
 */
export function startActiveThreadHeartbeat(threadKey: string): () => void {
  if (typeof document === "undefined") return () => {};
  const deviceId = getDeviceId();
  if (!deviceId) return () => {};

  let timer: ReturnType<typeof setInterval> | null = null;

  const start = () => {
    if (timer) return;
    post(deviceId, threadKey);
    timer = setInterval(() => post(deviceId, threadKey), ACTIVE_THREAD_HEARTBEAT_MS);
  };
  const stop = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    post(deviceId, null);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") start();
    else stop();
  };

  if (document.visibilityState === "visible") start();
  document.addEventListener("visibilitychange", onVisibility);
  // pagehide fires on iOS when the PWA is swiped away, where unmount never runs.
  window.addEventListener("pagehide", stop);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", stop);
    stop();
  };
}
