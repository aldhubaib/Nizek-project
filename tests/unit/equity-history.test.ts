import { describe, it, expect } from "vitest";
import {
  diffSnapshots,
  diffSplitRows,
  type SplitRow,
} from "@/lib/equity-diff";

function row(
  name: string,
  equityPct: number,
  opts: {
    role?: string;
    structureType?: string;
    dilutesAt?: number;
  } = {},
): SplitRow {
  return {
    structureType: opts.structureType ?? "FIXED",
    equityPct,
    holder: { name },
    role: opts.role ? { name: opts.role } : null,
    tranches: opts.dilutesAt != null ? [{ startsAtValuation: opts.dilutesAt }] : [],
  };
}

describe("diffSnapshots", () => {
  it("reports only the fields that moved", () => {
    const changes = diffSnapshots(
      { Title: "Founders agreement", Signed: "No" },
      { Title: "Founders agreement", Signed: "Yes" },
    );
    expect(changes).toEqual([{ label: "Signed", old: "No", new: "Yes" }]);
  });

  it("treats a missing before as a row being filled in for the first time", () => {
    const changes = diffSnapshots(null, { Title: "MOA", Notes: null });
    expect(changes).toEqual([{ label: "Title", old: null, new: "MOA" }]);
  });

  it("records a field being cleared", () => {
    const changes = diffSnapshots({ Notes: "Check with legal" }, { Notes: null });
    expect(changes).toEqual([
      { label: "Notes", old: "Check with legal", new: null },
    ]);
  });

  it("ignores fields the update didn't mention", () => {
    const changes = diffSnapshots({ Title: "MOA", Notes: "keep me" }, { Title: "MOA v2" });
    expect(changes).toEqual([{ label: "Title", old: "MOA", new: "MOA v2" }]);
  });
});

describe("diffSplitRows", () => {
  const currency = "KWD";

  it("says nothing when a split is saved unchanged", () => {
    const rows = [row("Nizek", 20, { role: "Partner" }), row("Founders", 80)];
    expect(diffSplitRows(rows, rows, currency)).toEqual([]);
  });

  it("reports a percentage moving on the row it belongs to", () => {
    const changes = diffSplitRows(
      [row("Nizek", 20, { role: "Partner" }), row("Founders", 80)],
      [row("Nizek", 25, { role: "Partner" }), row("Founders", 75)],
      currency,
    );
    expect(changes).toEqual([
      {
        action: "updated",
        changes: [
          { label: "Nizek · Partner — Equity %", old: "20%", new: "25%" },
        ],
      },
      {
        action: "updated",
        changes: [{ label: "Founders — Equity %", old: "80%", new: "75%" }],
      },
    ]);
  });

  it("reports a holder joining and a holder leaving", () => {
    const changes = diffSplitRows(
      [row("Nizek", 20), row("Founders", 80)],
      [row("Nizek", 20), row("Angel", 10)],
      currency,
    );
    expect(changes).toEqual([
      { action: "created", label: "Angel", value: "10% · Fixed" },
      { action: "deleted", label: "Founders", value: "80% · Fixed" },
    ]);
  });

  it("leaves untouched rows alone when one is inserted above them", () => {
    const changes = diffSplitRows(
      [row("Founders", 80)],
      [row("Angel", 10), row("Founders", 80)],
      currency,
    );
    expect(changes).toEqual([
      { action: "created", label: "Angel", value: "10% · Fixed" },
    ]);
  });

  it("tells apart a holder's protected stages rather than merging them", () => {
    const before = [
      row("Nizek", 10, { structureType: "TRANCHED", dilutesAt: 500_000 }),
      row("Nizek", 5, { structureType: "TRANCHED", dilutesAt: 1_000_000 }),
    ];
    const after = [
      row("Nizek", 10, { structureType: "TRANCHED", dilutesAt: 500_000 }),
      row("Nizek", 8, { structureType: "TRANCHED", dilutesAt: 1_000_000 }),
    ];
    expect(diffSplitRows(before, after, currency)).toEqual([
      {
        action: "updated",
        changes: [{ label: "Nizek (2) — Equity %", old: "5%", new: "8%" }],
      },
    ]);
  });

  it("reports a row switching from fixed to protected", () => {
    const changes = diffSplitRows(
      [row("Nizek", 20)],
      [row("Nizek", 20, { structureType: "TRANCHED", dilutesAt: 750_000 })],
      currency,
    );
    expect(changes).toEqual([
      {
        action: "updated",
        changes: [
          { label: "Nizek — Type", old: "Fixed", new: "Protected" },
          { label: "Nizek — Dilutes at", old: null, new: "750,000 KWD" },
        ],
      },
    ]);
  });

  it("counts every row of a brand new split as added", () => {
    const changes = diffSplitRows([], [row("Nizek", 20), row("Founders", 80)], currency);
    expect(changes.map((c) => c.action)).toEqual(["created", "created"]);
  });

  it("treats a renamed holder as one leaving and another arriving", () => {
    const changes = diffSplitRows([row("Nizek", 20)], [row("Nizek Co", 20)], currency);
    expect(changes).toEqual([
      { action: "created", label: "Nizek Co", value: "20% · Fixed" },
      { action: "deleted", label: "Nizek", value: "20% · Fixed" },
    ]);
  });
});
