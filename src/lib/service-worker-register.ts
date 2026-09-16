import { startPushRuntime } from "@/lib/push/store";

/**
 * Starts the push runtime (which registers /sw.js in production and
 * unregisters everything in dev) as early as the shell mounts. Kept as a
 * named entry point so the shells don't import the store directly.
 */
export function bootstrapServiceWorker() {
  startPushRuntime();
}
