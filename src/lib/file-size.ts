/**
 * A byte count as a person would read it.
 *
 * Nothing rather than "0 B" for a missing size, because every caller shows this
 * beside a filename as an aside and an empty aside is better than a wrong one.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
