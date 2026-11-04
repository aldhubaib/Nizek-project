// Pure helpers for the thread "changes since" catch-up (no React, no Prisma).
// The realtime hook uses them to reconcile the in-memory message list with
// what the server says changed while the socket was asleep.

type Row = { id: string; createdAt: string; updatedAt?: string };

/**
 * How far behind the newest known timestamp a catch-up starts. A message can
 * commit with a timestamp slightly older than one we already received (its
 * transaction was still open), so asking from the exact edge could skip it.
 * Re-sending a few rows is free: applying them is idempotent.
 */
export const SYNC_OVERLAP_MS = 30_000;

/**
 * The `since` for the next catch-up: the newest server timestamp the client
 * holds, minus the overlap. Null when nothing is loaded (the caller falls back
 * to fetching the newest page).
 */
export function threadSyncCursor(
  messages: ReadonlyArray<Row>,
  overlapMs = SYNC_OVERLAP_MS,
): string | null {
  let max = -Infinity;
  for (const m of messages) {
    const t = new Date(m.updatedAt ?? m.createdAt).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max === -Infinity ? null : new Date(max - overlapMs).toISOString();
}

/** Server time from the last catch-up → the next `since`, with the same overlap. */
export function nextSyncCursor(serverTimeIso: string, overlapMs = SYNC_OVERLAP_MS): string {
  const t = new Date(serverTimeIso).getTime();
  return new Date((Number.isFinite(t) ? t : Date.now()) - overlapMs).toISOString();
}

function byCreatedAt(a: Row, b: Row): number {
  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return diff !== 0 ? diff : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Apply a change set: drop deleted ids, replace rows we hold, and add rows we
 * don't — but only inside the loaded window. A row older than the oldest
 * loaded message is skipped (it would open a gap that "load older" can't see);
 * paging back fetches it in order anyway.
 *
 * Returns the same array when nothing changed so React skips the re-render.
 */
export function applyThreadChanges<T extends Row>(
  local: T[],
  changes: { messages: T[]; deletedIds: string[] },
): T[] {
  const deleted = new Set(changes.deletedIds);
  const byId = new Map<string, T>();
  for (const m of local) byId.set(m.id, m);

  let changed = false;
  for (const id of deleted) {
    if (byId.delete(id)) changed = true;
  }

  const oldestLoaded = local.length > 0 ? Math.min(...local.map((m) => new Date(m.createdAt).getTime())) : null;
  for (const m of changes.messages) {
    if (deleted.has(m.id)) continue;
    const existing = byId.get(m.id);
    if (existing) {
      if (existing.updatedAt && m.updatedAt && existing.updatedAt >= m.updatedAt) continue;
      byId.set(m.id, { ...existing, ...m });
      changed = true;
      continue;
    }
    if (oldestLoaded !== null && new Date(m.createdAt).getTime() < oldestLoaded) continue;
    byId.set(m.id, m);
    changed = true;
  }
  if (!changed) return local;
  return [...byId.values()].sort(byCreatedAt);
}
