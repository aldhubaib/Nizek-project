/** Routes a real client (or view-as-client) may stay on. Everything else is inbox. */
export const CLIENT_ALLOWED_PREFIXES = [
  "/dashboard/messages",
  "/dashboard/account",
] as const;

export function isClientAllowedPath(pathname: string): boolean {
  return CLIENT_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
