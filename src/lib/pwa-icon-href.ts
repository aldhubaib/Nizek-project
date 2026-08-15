/** Same-origin PWA icon URL. Chrome treats icon src as immutable, so the
 * query must change whenever the uploaded artwork changes. */
export function pwaIconHref(
  path: string,
  updatedAt: number | null | undefined,
): string {
  const v = updatedAt && updatedAt > 0 ? String(updatedAt) : "0";
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${v}`;
}
