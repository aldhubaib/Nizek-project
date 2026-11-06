/**
 * URL schemes of the React Native app in ./mobile. Better Auth deep-links back
 * to `${scheme}://` after Google sign-in, so these must match what the app
 * registers (mobile/app.json `expo.scheme`, changed per variant by
 * mobile/app.config.ts).
 */
export const MOBILE_APP_SCHEME = "nizek";

/** The staging build of the app (`APP_VARIANT=staging`), installable next to the real one. */
export const MOBILE_APP_STAGING_SCHEME = "nizek-staging";

/**
 * Schemes this server may deep-link back to. Live production trusts only the
 * real app. `MOBILE_APP_SCHEMES` (comma separated) overrides the list; the
 * staging environment sets it to "nizek,nizek-staging" in .railway/railway.ts.
 * Outside production builds (local development) both are trusted.
 */
export function trustedMobileSchemes(): string[] {
  const fromEnv = (process.env.MOBILE_APP_SCHEMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z][a-z0-9+.-]*$/i.test(s));
  if (fromEnv.length > 0) return fromEnv;
  return process.env.NODE_ENV === "production"
    ? [MOBILE_APP_SCHEME]
    : [MOBILE_APP_SCHEME, MOBILE_APP_STAGING_SCHEME];
}
