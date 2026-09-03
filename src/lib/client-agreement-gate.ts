/**
 * The two decisions behind the client user agreement, with no dependency on
 * Prisma or the DOM so they stay unit testable. `@/lib/client-agreement`
 * re-exports both alongside the query helpers — import from there in app code.
 */

/**
 * Whether this person still has to accept before they can carry on.
 *
 * No published version means nobody is gated. That is the safe direction for a
 * lookup that comes back empty: an install with nothing published, or a query
 * that failed to find the newest version, must not lock every client out of
 * their chat over a document that does not exist yet.
 *
 * Acceptance is matched by version id rather than counted, which is what makes
 * publishing a new version re-gate everyone automatically — the rows recording
 * the previous version stay exactly where they are, and simply do not match.
 */
export function needsAcceptance(
  latestPublished: { id: string } | null | undefined,
  acceptance: { versionId: string } | null | undefined,
): boolean {
  if (!latestPublished) return false;
  return acceptance?.versionId !== latestPublished.id;
}

/** How close to the bottom counts as having reached it, in pixels. */
export const SCROLL_END_TOLERANCE = 24;

/**
 * Whether a scroll container has been read to the end.
 *
 * A document shorter than its container can never be scrolled, so it counts as
 * read straight away — otherwise a one-paragraph agreement would leave Accept
 * disabled with no way for anyone to enable it.
 *
 * The tolerance covers fractional heights from zoom and subpixel layout, which
 * otherwise leave scrollTop a fraction short of the bottom for good.
 */
export function hasReachedEnd(
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number },
  tolerance = SCROLL_END_TOLERANCE,
): boolean {
  const { scrollTop, clientHeight, scrollHeight } = metrics;
  if (scrollHeight <= clientHeight + tolerance) return true;
  return scrollTop + clientHeight >= scrollHeight - tolerance;
}
