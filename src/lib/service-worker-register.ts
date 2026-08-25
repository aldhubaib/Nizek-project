/**
 * Registers the production service worker as early as the dashboard shell
 * mounts. Prompt UI is lazy-loaded separately and must not delay this.
 * Dev unregisters any controlling SW so Turbopack chunks stay fresh.
 */
export function bootstrapServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  if (process.env.NODE_ENV !== "production") {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
    return;
  }

  void navigator.serviceWorker.register("/sw.js").catch(() => {});
}
