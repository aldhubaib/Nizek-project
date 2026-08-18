// OS app-icon badge (installed PWA / supporting browsers). All calls are guarded
// by a feature check and swallow errors so unsupported platforms are no-ops.

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Set the app-icon badge to `count`, or clear it when 0/negative. */
export function updateAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0) {
      void nav.setAppBadge?.(count)?.catch(() => {});
    } else {
      void nav.clearAppBadge?.()?.catch(() => {});
    }
  } catch {
    // Unsupported — ignore.
  }
}

/** Clear the app-icon badge. */
export function clearAppBadge(): void {
  updateAppBadge(0);
}
