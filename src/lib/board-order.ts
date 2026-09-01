/**
 * Where a row sits in a hand-ordered list.
 *
 * Positions are floats and a row dropped between two others takes the midpoint
 * of its neighbours, so a drag writes one row rather than renumbering every row
 * after it. `Task.order` is an integer and does the renumbering; that is fine
 * for a sprint board holding a few dozen tasks and a poor trade for a column
 * that can hold hundreds.
 *
 * Halving a gap forever runs out of float eventually, so `needsRebalance` says
 * when the neighbours have grown too close to sit between and the caller should
 * respace the list instead. In practice that takes upwards of fifty consecutive
 * drops into the same gap, and the respacing is a single transaction.
 *
 * Kept free of Prisma so it can be unit-tested directly.
 */

/** Spacing for freshly seeded or respaced lists. */
export const POSITION_STEP = 1024;

/**
 * The closest two neighbours may be before the midpoint between them stops
 * being reliably distinct from both. Well above the float epsilon: the aim is
 * to respace early and cheaply, not to find the exact point of failure.
 */
export const MIN_POSITION_GAP = 1e-6;

/**
 * A position between two neighbours. A null neighbour means the end of the
 * list, so dropping at the top or the bottom steps beyond the row that is
 * there rather than trying to average against nothing.
 */
export function positionBetween(
  before: number | null | undefined,
  after: number | null | undefined,
): number {
  const lower = before ?? null;
  const upper = after ?? null;
  if (lower === null && upper === null) return POSITION_STEP;
  if (lower === null) return (upper as number) - POSITION_STEP;
  if (upper === null) return lower + POSITION_STEP;
  return (lower + upper) / 2;
}

/** True when the gap has closed far enough that the list should be respaced. */
export function needsRebalance(
  before: number | null | undefined,
  after: number | null | undefined,
): boolean {
  if (before == null || after == null) return false;
  return Math.abs(after - before) < MIN_POSITION_GAP;
}

/**
 * The position for a row landing at `index` in a list already sorted ascending.
 *
 * `positions` must not include the row being moved: a row is taken out of the
 * list before it is put back, so its own position can never be one of the
 * neighbours it is measured against.
 */
export function positionForIndex(positions: number[], index: number): number {
  const clamped = Math.max(0, Math.min(index, positions.length));
  const before = clamped === 0 ? null : positions[clamped - 1];
  const after = clamped === positions.length ? null : positions[clamped];
  return positionBetween(before, after);
}

/** Evenly spaced positions for a list of `count` rows, in their current order. */
export function rebalancedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
}

/**
 * Move `movedId` to `index` within `ordered` and hand back the rows whose
 * position changed.
 *
 * Usually that is the one row that moved. When its new neighbours are too close
 * together to sit between, the whole list is respaced instead and every row
 * comes back — which is why the return is a list rather than a single position.
 */
export function planMove<T extends { id: string; position: number }>(
  ordered: T[],
  movedId: string,
  index: number,
): { id: string; position: number }[] {
  const without = ordered.filter((row) => row.id !== movedId);
  const clamped = Math.max(0, Math.min(index, without.length));
  const before = clamped === 0 ? null : without[clamped - 1].position;
  const after = clamped === without.length ? null : without[clamped].position;

  if (needsRebalance(before, after)) {
    const resequenced = [
      ...without.slice(0, clamped),
      { id: movedId, position: 0 },
      ...without.slice(clamped),
    ];
    const spaced = rebalancedPositions(resequenced.length);
    return resequenced.map((row, i) => ({ id: row.id, position: spaced[i] }));
  }

  return [{ id: movedId, position: positionBetween(before, after) }];
}

/**
 * Positions for a list stated in full, as the settings screens do when a whole
 * column or field list is reordered at once. Always respaces, since the caller
 * is rewriting the order anyway.
 */
export function planReorder(orderedIds: string[]): { id: string; position: number }[] {
  const spaced = rebalancedPositions(orderedIds.length);
  return orderedIds.map((id, i) => ({ id, position: spaced[i] }));
}
