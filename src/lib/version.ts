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
 * URL for the app logo / favicon, cache-busted by the current version so a deploy
 * that changes the logo is picked up by clients without a manual hard refresh.
 */
export function getAppLogoUrl(version = getAppVersion()): string {
  return `/favicon.ico?v=${encodeURIComponent(version)}`;
}

/**
 * The version reported to clients for update detection. It's the deploy version
 * plus a token that changes when the admin swaps the notification sound — so a
 * sound change (no deploy) also trips the "new version available" prompt,
 * letting us force clients to reload into the new sound.
 *
 * Both the baked-in page value and /api/version compute this the same way from
 * the DB (uncached), so they only differ after an actual change.
 */
export async function getClientVersion(): Promise<string> {
  const { getNotificationSoundToken } = await import("@/lib/branding");
  const soundToken = await getNotificationSoundToken();
  return `${getAppVersion()}.s${soundToken}`;
}
