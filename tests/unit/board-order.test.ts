import { describe, it, expect } from "vitest";
import {
  MIN_POSITION_GAP,
  POSITION_STEP,
  needsRebalance,
  planMove,
  planReorder,
  positionBetween,
  positionForIndex,
  rebalancedPositions,
} from "@/lib/board-order";

function rows(...positions: number[]) {
  return positions.map((position, i) => ({ id: `c${i}`, position }));
}

/** Read a plan back as the order the list ends up in. */
function orderAfter(
  ordered: { id: string; position: number }[],
  changes: { id: string; position: number }[],
): string[] {
  const patched = new Map(changes.map((c) => [c.id, c.position]));
  const moved = changes.find((c) => !ordered.some((r) => r.id === c.id));
  const all = moved ? [...ordered, moved] : ordered;
  return all
    .map((row) => ({ id: row.id, position: patched.get(row.id) ?? row.position }))
    .sort((a, b) => a.position - b.position)
    .map((row) => row.id);
}

describe("positionBetween", () => {
  it("takes the midpoint of two neighbours", () => {
    expect(positionBetween(100, 200)).toBe(150);
  });

  it("steps past the first row when dropping at the top", () => {
    expect(positionBetween(null, 100)).toBe(100 - POSITION_STEP);
  });

  it("steps past the last row when dropping at the bottom", () => {
    expect(positionBetween(100, null)).toBe(100 + POSITION_STEP);
  });

  it("seeds an empty list", () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
  });

  it("keeps ordering when the list has run negative", () => {
    // Repeated drops at the top walk positions below zero, which is fine as
    // long as the result still sorts before its neighbour.
    const top = positionBetween(null, -5000);
    expect(top).toBeLessThan(-5000);
  });
});

describe("positionForIndex", () => {
  const positions = [1024, 2048, 3072];

  it("places a row at the front", () => {
    expect(positionForIndex(positions, 0)).toBeLessThan(1024);
  });

  it("places a row in the middle", () => {
    expect(positionForIndex(positions, 1)).toBe(1536);
  });

  it("places a row at the end", () => {
    expect(positionForIndex(positions, 3)).toBeGreaterThan(3072);
  });

  it("clamps an index past the end rather than returning NaN", () => {
    expect(Number.isFinite(positionForIndex(positions, 99))).toBe(true);
  });

  it("clamps a negative index", () => {
    expect(positionForIndex(positions, -3)).toBe(positionForIndex(positions, 0));
  });

  it("seeds an empty column", () => {
    expect(positionForIndex([], 0)).toBe(POSITION_STEP);
  });
});

describe("needsRebalance", () => {
  it("is false for ordinary spacing", () => {
    expect(needsRebalance(1024, 2048)).toBe(false);
  });

  it("is false at the ends, where there is nothing to sit between", () => {
    expect(needsRebalance(null, 100)).toBe(false);
    expect(needsRebalance(100, null)).toBe(false);
  });

  it("is true once neighbours have closed to the floor", () => {
    expect(needsRebalance(1, 1 + MIN_POSITION_GAP / 2)).toBe(true);
  });
});

describe("planMove", () => {
  it("writes a single row for an ordinary move", () => {
    const ordered = rows(1024, 2048, 3072);
    const changes = planMove(ordered, "c0", 2);
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe("c0");
  });

  it("puts the row where it was asked to go", () => {
    const ordered = rows(1024, 2048, 3072);
    const changes = planMove(ordered, "c0", 2);
    expect(orderAfter(ordered, changes)).toEqual(["c1", "c2", "c0"]);
  });

  it("moves a row to the front", () => {
    const ordered = rows(1024, 2048, 3072);
    const changes = planMove(ordered, "c2", 0);
    expect(orderAfter(ordered, changes)).toEqual(["c2", "c0", "c1"]);
  });

  it("measures against neighbours without counting the moved row itself", () => {
    // Moving c1 to index 1 in a three-row list must land it between c0 and c2,
    // not between itself and c2.
    const ordered = rows(1024, 2048, 3072);
    const changes = planMove(ordered, "c1", 1);
    expect(orderAfter(ordered, changes)).toEqual(["c0", "c1", "c2"]);
  });

  it("adds a row arriving from another column", () => {
    const ordered = rows(1024, 2048);
    const changes = planMove(ordered, "incoming", 1);
    expect(changes).toEqual([{ id: "incoming", position: 1536 }]);
  });

  it("respaces the whole list when the gap has closed", () => {
    const ordered = [
      { id: "a", position: 1 },
      { id: "b", position: 1 + MIN_POSITION_GAP / 4 },
      { id: "c", position: 5000 },
    ];
    const changes = planMove(ordered, "c", 1);
    expect(changes).toHaveLength(3);
    expect(changes.map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("leaves a respaced list evenly spread and in the intended order", () => {
    const ordered = [
      { id: "a", position: 1 },
      { id: "b", position: 1 + MIN_POSITION_GAP / 4 },
      { id: "c", position: 5000 },
    ];
    const changes = planMove(ordered, "c", 1);
    expect(changes.map((c) => c.position)).toEqual(rebalancedPositions(3));
  });

  it("survives repeated drops into the same gap", () => {
    // The case the rebalance exists for: halving one gap over and over.
    let ordered = rows(1024, 2048, 3072);
    for (let i = 0; i < 200; i += 1) {
      const changes = planMove(ordered, "c2", 1);
      const patched = new Map(changes.map((c) => [c.id, c.position]));
      ordered = ordered
        .map((row) => ({ id: row.id, position: patched.get(row.id) ?? row.position }))
        .sort((a, b) => a.position - b.position);
      const positions = ordered.map((r) => r.position);
      expect(new Set(positions).size).toBe(positions.length);
    }
    expect(ordered.map((r) => r.id)).toEqual(["c0", "c2", "c1"]);
  });
});

describe("planReorder", () => {
  it("respaces a list stated in full", () => {
    expect(planReorder(["x", "y", "z"])).toEqual([
      { id: "x", position: POSITION_STEP },
      { id: "y", position: POSITION_STEP * 2 },
      { id: "z", position: POSITION_STEP * 3 },
    ]);
  });

  it("handles an empty list", () => {
    expect(planReorder([])).toEqual([]);
  });
});
