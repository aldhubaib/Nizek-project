/** Merge a cached message list with a server/prefetch page without dropping older pages. */
export function mergeThreadMessages<T extends { id: string; createdAt: string }>(
  local: T[],
  incoming: T[],
): T[] {
  if (local.length === 0) return incoming;
  if (incoming.length === 0) return local;
  const byId = new Map<string, T>();
  for (const m of local) byId.set(m.id, m);
  for (const m of incoming) {
    const existing = byId.get(m.id);
    byId.set(m.id, existing ? { ...existing, ...m } : m);
  }
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
