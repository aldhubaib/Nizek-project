/**
 * Who may open the new frontend (`/next`) while it is still being built.
 *
 * The live panel shows these people a "New panel" entry in the sidebar and the
 * `/next` pages open for them. Everyone else sees no entry, and typing the
 * address sends them back to `/dashboard`. Add an email here to let one more
 * person in; the switch-over for everybody is a separate step.
 */
const NEXT_UI_PREVIEW_EMAILS: ReadonlySet<string> = new Set([
  "aldhubaib@nizek.com",
]);

export function canPreviewNextUi(
  user: { email?: string | null } | null | undefined,
): boolean {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(email && NEXT_UI_PREVIEW_EMAILS.has(email));
}
