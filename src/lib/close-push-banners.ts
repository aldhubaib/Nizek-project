/** Close any OS push banners shown by our service worker that match `tags`. */
export async function closePushBannersByTags(tags: string[]): Promise<void> {
  if (!tags.length || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const shown = await reg.getNotifications();
    const wanted = new Set(tags);
    for (const n of shown) {
      if (n.tag && wanted.has(n.tag)) n.close();
    }
  } catch {
    // Best-effort — banners will be replaced by the next push for that thread.
  }
}
