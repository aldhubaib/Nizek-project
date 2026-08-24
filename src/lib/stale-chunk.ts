/** Turbopack/Next left the tab holding a JS graph that no longer exists. */
export function isStaleChunkError(error: { message?: string } | null | undefined): boolean {
  const msg = error?.message ?? "";
  return (
    msg.includes("module factory is not available") ||
    msg.includes("stale browser cache, misconfigured Cache-Control")
  );
}
