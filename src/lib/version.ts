/**
 * A stable identifier for the currently deployed build.
 *
 * On Railway, `RAILWAY_GIT_COMMIT_SHA` is injected at both build and runtime and
 * changes with every deploy, so it doubles as our "app version". The layout bakes
 * this value into the page the user loads, and `/api/version` returns the value of
 * whatever container is currently live. When they differ, a newer version has been
 * deployed and we prompt the user to update.
 */
export function getAppVersion(): string {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    "dev"
  );
}

/**
 * The version reported to clients for update detection. It's the deploy version
 * plus a token that changes when the admin swaps branding (logos or the
 * notification sound) — so those changes (no deploy) also trip the "new version
 * available" prompt and force clients to reload into the new assets.
 *
 * Both the baked-in page value and /api/version compute this the same way from
 * the DB (uncached), so they only differ after an actual change.
 */
export async function getClientVersion(): Promise<string> {
  const { getBrandingChangeToken } = await import("@/lib/branding");
  const token = await getBrandingChangeToken();
  return `${getAppVersion()}.b${token}`;
}

/**
 * URL for the app logo / favicon, cache-busted so a branding upload is picked
 * up without a manual hard refresh.
 */
export async function getAppLogoUrl(): Promise<string> {
  const { brandingUrlWithBust, getBrandingMap } = await import("@/lib/branding");
  const map = await getBrandingMap();
  return (
    brandingUrlWithBust(map, "favicon") ??
    `/favicon.ico?v=${encodeURIComponent(getAppVersion())}`
  );
}
