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
