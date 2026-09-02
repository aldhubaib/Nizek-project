import { describe, it, expect } from "vitest";
import {
  baseCurrencyOf,
  changeVsPrevious,
  convertToBase,
  draftToValues,
  figureAt,
  financialMonths,
  formatMonth,
  formatPackLabel,
  formulaDependencies,
  marginOf,
  monthColumn,
  monthKeyOf,
  monthKeysOfYear,
  monthStartOf,
  packCellsToValues,
  parsePastedNumber,
  publishedPacks,
  resolveMonthlySeries,
  resolveNumber,
  summariseFinancials,
  supersededAt,
  wouldCycle,
  ytdTotal,
  type MetricDef,
  type Pack,
} from "@/lib/equity-financials";

const month = (year: number, m: number) => new Date(Date.UTC(year, m - 1, 1)).toISOString();

// The P&L from the pack we're modelling: revenue and cost of sales are entered,
// gross profit is worked out, and net profit is built on gross profit rather
// than reaching back to revenue — which is the nesting the old view couldn't do.
const REVENUE: MetricDef = { id: "revenue", type: "NUMBER" };
const COST: MetricDef = { id: "cost", type: "NUMBER" };
const OTHER: MetricDef = { id: "other", type: "NUMBER" };
const GA: MetricDef = { id: "ga", type: "NUMBER" };
const GROSS: MetricDef = {
  id: "gross",
  type: "FORMULA",
  formulaOp: "SUBTRACT",
  leftId: "revenue",
  rightId: "cost",
};
const GROSS_PLUS_OTHER: MetricDef = {
  id: "grossPlusOther",
  type: "FORMULA",
  formulaOp: "ADD",
  leftId: "gross",
  rightId: "other",
};
const NET: MetricDef = {
  id: "net",
  type: "FORMULA",
  formulaOp: "SUBTRACT",
  leftId: "grossPlusOther",
  rightId: "ga",
};

const registry = new Map<string, MetricDef>(
  [REVENUE, COST, OTHER, GA, GROSS, GROSS_PLUS_OTHER, NET].map((m) => [m.id, m]),
);

function pack(id: string, reportedOn: string, rows: [string, string, number][]): Pack {
  return {
    id,
    reportedOn,
    values: rows.map(([metricId, m, numberValue]) => ({
      metricId,
      month: m,
      numberValue,
      dateValue: null,
    })),
  };
}

describe("month keys", () => {
  it("keys a month by its year and month in UTC", () => {
    expect(monthKeyOf(month(2026, 3))).toBe("2026-03");
    expect(monthKeyOf("2026-12-31T23:59:59.000Z")).toBe("2026-12");
  });

  it("has no key for a date that isn't one", () => {
    expect(monthKeyOf("not a date")).toBeNull();
  });

  it("round-trips a key back to the first of the month at UTC midnight", () => {
    expect(monthStartOf("2026-07")).toBe(month(2026, 7));
    expect(monthStartOf("2026-13")).toBeNull();
    expect(monthStartOf("nonsense")).toBeNull();
  });

  it("lays a year out as twelve columns, oldest first", () => {
    const keys = monthKeysOfYear(2026);
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2026-01");
    expect(keys[11]).toBe("2026-12");
  });

  it("reads a month and a pack as their labels", () => {
    expect(formatMonth("2026-03")).toBe("Mar 2026");
    expect(formatMonth("2026-03", false)).toBe("Mar");
    expect(formatPackLabel(month(2026, 7))).toBe("July 2026");
    expect(formatPackLabel(null)).toBe("—");
  });
});

describe("resolveMonthlySeries", () => {
  // The case the whole model exists for: an April pack states Q1, then a July
  // pack restates it after the auditor moved figures around.
  const april = pack("april", month(2026, 4), [
    ["revenue", month(2026, 1), 100],
    ["revenue", month(2026, 2), 200],
    ["revenue", month(2026, 3), 300],
  ]);
  const july = pack("july", month(2026, 7), [
    ["revenue", month(2026, 1), 110],
    ["revenue", month(2026, 2), 200],
    ["revenue", month(2026, 6), 600],
  ]);

  it("lets the later pack's figure be the one that counts", () => {
    const series = resolveMonthlySeries([april, july]);
    expect(figureAt(series, "revenue", "2026-01")?.numberValue).toBe(110);
    expect(figureAt(series, "revenue", "2026-01")?.packId).toBe("july");
  });

  it("keeps a month the later pack didn't mention", () => {
    const series = resolveMonthlySeries([april, july]);
    expect(figureAt(series, "revenue", "2026-03")?.numberValue).toBe(300);
    expect(figureAt(series, "revenue", "2026-03")?.packId).toBe("april");
  });

  // Otherwise "what changed in the July report" would be unanswerable, and a
  // restated cell couldn't say what it used to be.
  it("keeps what a restatement replaced, rather than overwriting it", () => {
    const series = resolveMonthlySeries([april, july]);
    const history = supersededAt(series, "revenue", "2026-01");
    expect(history).toHaveLength(1);
    expect(history[0].numberValue).toBe(100);
    expect(history[0].packId).toBe("april");
  });

  it("records no restatement for a figure only one pack stated", () => {
    const series = resolveMonthlySeries([april, july]);
    expect(supersededAt(series, "revenue", "2026-06")).toEqual([]);
  });

  // A figure restated to the same number is still a restatement — the July pack
  // did state February, and the history has to show it looked at it.
  it("treats a restatement to the same figure as a restatement", () => {
    const series = resolveMonthlySeries([april, july]);
    expect(figureAt(series, "revenue", "2026-02")?.packId).toBe("july");
    expect(supersededAt(series, "revenue", "2026-02")).toHaveLength(1);
  });

  // Packs get typed in out of order, and reportedOn is the only thing that says
  // which one is the correction.
  it("orders packs by when they were reported, not by the order given", () => {
    const backwards = resolveMonthlySeries([july, april]);
    expect(figureAt(backwards, "revenue", "2026-01")?.numberValue).toBe(110);
  });

  it("lists every month any pack speaks about, oldest first", () => {
    const series = resolveMonthlySeries([april, july]);
    expect(series.months).toEqual(["2026-01", "2026-02", "2026-03", "2026-06"]);
  });

  it("ignores a value whose month isn't a date", () => {
    const broken: Pack = {
      id: "broken",
      reportedOn: month(2026, 4),
      values: [{ metricId: "revenue", month: "whenever", numberValue: 5, dateValue: null }],
    };
    expect(resolveMonthlySeries([broken]).months).toEqual([]);
  });

  it("has nothing to say about a project with no packs", () => {
    const series = resolveMonthlySeries([]);
    expect(series.months).toEqual([]);
    expect(figureAt(series, "revenue", "2026-01")).toBeNull();
  });
});

describe("formulaDependencies", () => {
  it("has nothing under a field that is entered rather than worked out", () => {
    const { all, leaves } = formulaDependencies("revenue", registry);
    expect([...all]).toEqual([]);
    expect([...leaves]).toEqual(["revenue"]);
  });

  it("names the operands of a one-step calculation", () => {
    expect([...formulaDependencies("gross", registry).all].sort()).toEqual(["cost", "revenue"]);
  });

  // What the field picker needs: net profit is reported only if the plain
  // figures at the bottom of the chain are, and gross profit — an intermediate
  // calculation — is never reported itself.
  it("follows a nested calculation down to the figures actually entered", () => {
    const { all, leaves } = formulaDependencies("net", registry);
    expect([...all].sort()).toEqual(["cost", "ga", "gross", "grossPlusOther", "other", "revenue"]);
    expect([...leaves].sort()).toEqual(["cost", "ga", "other", "revenue"]);
  });

  it("stops on a cycle rather than recursing forever", () => {
    const looped = new Map<string, MetricDef>([
      ["a", { id: "a", type: "FORMULA", formulaOp: "ADD", leftId: "b", rightId: "b" }],
      ["b", { id: "b", type: "FORMULA", formulaOp: "ADD", leftId: "a", rightId: "a" }],
    ]);
    expect([...formulaDependencies("a", looped).all].sort()).toEqual(["a", "b"]);
  });
});

describe("wouldCycle", () => {
  it("refuses a field as its own operand", () => {
    expect(wouldCycle("gross", "gross", registry)).toBe(true);
  });

  it("refuses an operand already worked out from the field", () => {
    expect(wouldCycle("gross", "net", registry)).toBe(true);
  });

  it("allows a calculation to stand on an unrelated calculation", () => {
    expect(wouldCycle("net", "gross", registry)).toBe(false);
  });

  it("allows a plain figure", () => {
    expect(wouldCycle("gross", "revenue", registry)).toBe(false);
  });
});

describe("resolveNumber", () => {
  const stored = (values: Record<string, number>) => (id: string) => values[id] ?? null;

  it("reads an entered field straight back", () => {
    expect(resolveNumber("revenue", registry, stored({ revenue: 100 }))).toBe(100);
  });

  it("works a formula out from its operands", () => {
    expect(resolveNumber("gross", registry, stored({ revenue: 100, cost: 40 }))).toBe(60);
  });

  // The gap the plan is closing: net profit stands on gross profit, which is
  // itself calculated and therefore never stored.
  it("lets a formula stand on another formula", () => {
    const values = { revenue: 100, cost: 40, other: 5, ga: 25 };
    expect(resolveNumber("net", registry, stored(values))).toBe(40);
  });

  it("has no answer while an operand underneath is unreported", () => {
    expect(resolveNumber("net", registry, stored({ revenue: 100, cost: 40, ga: 25 }))).toBeNull();
  });

  it("has no answer for a field that isn't in the registry", () => {
    expect(resolveNumber("ghost", registry, stored({}))).toBeNull();
  });

  // A field defined in terms of itself is a mistake in the registry; the reading
  // of it must be "nobody can say", not a blown stack.
  it("gives up on a cycle instead of recursing forever", () => {
    const looped = new Map<string, MetricDef>([
      ["a", { id: "a", type: "FORMULA", formulaOp: "ADD", leftId: "b", rightId: "b" }],
      ["b", { id: "b", type: "FORMULA", formulaOp: "ADD", leftId: "a", rightId: "a" }],
    ]);
    expect(resolveNumber("a", looped, () => null)).toBeNull();
  });

  it("gives up on a field that refers to itself", () => {
    const selfish = new Map<string, MetricDef>([
      ["a", { id: "a", type: "FORMULA", formulaOp: "ADD", leftId: "a", rightId: "a" }],
    ]);
    expect(resolveNumber("a", selfish, () => null)).toBeNull();
  });

  // The same formula asked for twice in a month is the same answer, so the
  // operands underneath should only be walked once.
  it("only reads each field once for a column", () => {
    const reads: string[] = [];
    const counting = (id: string) => {
      reads.push(id);
      return { revenue: 100, cost: 40, other: 5, ga: 25 }[id] ?? null;
    };
    const memo = new Map<string, number | null>();
    resolveNumber("net", registry, counting, memo);
    resolveNumber("gross", registry, counting, memo);
    expect(reads.filter((id) => id === "revenue")).toHaveLength(1);
  });
});

describe("monthColumn", () => {
  const series = resolveMonthlySeries([
    pack("q1", month(2026, 4), [
      ["revenue", month(2026, 1), 100],
      ["cost", month(2026, 1), 40],
      ["other", month(2026, 1), 5],
      ["ga", month(2026, 1), 25],
      ["revenue", month(2026, 2), 120],
    ]),
  ]);

  it("resolves entered and calculated fields together for one month", () => {
    const column = monthColumn(series, registry, ["revenue", "gross", "net"], "2026-01");
    expect(column.get("revenue")).toBe(100);
    expect(column.get("gross")).toBe(60);
    expect(column.get("net")).toBe(40);
  });

  // Each month is resolved on its own figures; February's gross profit must not
  // inherit January's cost of sales.
  it("keeps months from borrowing each other's figures", () => {
    const column = monthColumn(series, registry, ["revenue", "gross"], "2026-02");
    expect(column.get("revenue")).toBe(120);
    expect(column.get("gross")).toBeNull();
  });
});

describe("ytdTotal", () => {
  it("adds the months that were reported", () => {
    expect(ytdTotal([100, 200, 300])).toBe(600);
  });

  // A month nobody filed is a gap in reporting, not a month of zero revenue.
  it("skips a month nobody filed rather than counting it as nothing", () => {
    expect(ytdTotal([100, null, 300])).toBe(400);
  });

  it("has no total at all when nothing was reported", () => {
    expect(ytdTotal([null, undefined, null])).toBeNull();
  });

  it("counts a reported zero, because zero is an answer", () => {
    expect(ytdTotal([0, null])).toBe(0);
  });
});

describe("changeVsPrevious", () => {
  it("reads the move between two months as a fraction", () => {
    expect(changeVsPrevious(125, 100)).toBe(0.25);
    expect(changeVsPrevious(75, 100)).toBe(-0.25);
  });

  it("has no percentage for growth out of nothing", () => {
    expect(changeVsPrevious(100, 0)).toBeNull();
  });

  it("has no percentage when either month is missing", () => {
    expect(changeVsPrevious(100, null)).toBeNull();
    expect(changeVsPrevious(null, 100)).toBeNull();
  });

  // Coming back from a loss is still a measurable move, and the sign of the
  // result should say which way it went.
  it("measures a recovery from a loss against the size of the loss", () => {
    expect(changeVsPrevious(-50, -100)).toBe(0.5);
  });
});

describe("marginOf", () => {
  it("reads a profit against its revenue", () => {
    expect(marginOf(40, 200)).toBe(0.2);
  });

  it("has no margin on no revenue", () => {
    expect(marginOf(40, 0)).toBeNull();
    expect(marginOf(40, null)).toBeNull();
  });
});

describe("currency", () => {
  const rates = [
    { code: "KWD", rate: 1, isBase: true },
    { code: "USD", rate: 0.31, isBase: false },
  ];

  it("names the base currency the totals are in", () => {
    expect(baseCurrencyOf(rates)).toBe("KWD");
    expect(baseCurrencyOf([])).toBeNull();
  });

  it("converts a figure through its rate", () => {
    expect(convertToBase(1000, "USD", rates)).toBeCloseTo(310);
    expect(convertToBase(1000, "KWD", rates)).toBe(1000);
  });

  // Adding an unconverted figure into the total would be wrong in a way nobody
  // could see; refusing lets the caller name the project it had to leave out.
  it("refuses to convert a currency with no rate", () => {
    expect(convertToBase(1000, "EUR", rates)).toBeNull();
    expect(convertToBase(1000, null, rates)).toBeNull();
    expect(convertToBase(null, "USD", rates)).toBeNull();
  });
});

describe("summariseFinancials", () => {
  const rates = [
    { code: "KWD", rate: 1, isBase: true },
    { code: "USD", rate: 0.3, isBase: false },
  ];
  const months = ["2026-01", "2026-02"];

  const kuwaiti = {
    id: "kw",
    name: "Kuwaiti co",
    currency: "KWD",
    packs: [
      pack("kw-1", month(2026, 3), [
        ["revenue", month(2026, 1), 1000],
        ["cost", month(2026, 1), 400],
        ["ga", month(2026, 1), 100],
        ["other", month(2026, 1), 0],
        ["revenue", month(2026, 2), 1200],
        ["cost", month(2026, 2), 500],
        ["ga", month(2026, 2), 100],
        ["other", month(2026, 2), 0],
      ]),
    ],
  };
  const american = {
    id: "us",
    name: "American co",
    currency: "USD",
    packs: [pack("us-1", month(2026, 3), [["revenue", month(2026, 1), 2000]])],
  };
  const european = {
    id: "eu",
    name: "European co",
    currency: "EUR",
    packs: [pack("eu-1", month(2026, 3), [["revenue", month(2026, 1), 500]])],
  };

  const options = {
    topId: "revenue",
    bottomId: "net",
    months,
    registry,
    rates,
  };

  it("reads each project's own figures in its own currency", () => {
    const summary = summariseFinancials([kuwaiti], options);
    expect(summary.rows[0].top).toEqual([1000, 1200]);
    expect(summary.rows[0].topTotal).toBe(2200);
    // Net profit is a formula on a formula, so this also proves the resolver
    // runs across projects and not only on the portfolio page.
    expect(summary.rows[0].bottom).toEqual([500, 600]);
  });

  it("takes a project's margin from its totals", () => {
    const summary = summariseFinancials([kuwaiti], options);
    expect(summary.rows[0].margin).toBeCloseTo(1100 / 2200);
  });

  it("adds the projects together in the base currency", () => {
    const summary = summariseFinancials([kuwaiti, american], options);
    expect(summary.baseCurrency).toBe("KWD");
    // 1000 KWD + 2000 USD at 0.3
    expect(summary.topBase[0]).toBeCloseTo(1600);
    expect(summary.topBase[1]).toBeCloseTo(1200);
    expect(summary.topBaseTotal).toBeCloseTo(2800);
  });

  // A total short by a company is worse than a total that says which company it
  // is short by.
  it("names a project it had to leave out rather than dropping it quietly", () => {
    const summary = summariseFinancials([kuwaiti, european], options);
    expect(summary.excluded).toEqual([
      { id: "eu", name: "European co", currency: "EUR" },
    ]);
    expect(summary.topBase[0]).toBeCloseTo(1000);
  });

  it("still reports an unconvertible project's own figures", () => {
    const summary = summariseFinancials([european], options);
    expect(summary.rows[0].topTotal).toBe(500);
    expect(summary.rows[0].topTotalBase).toBeNull();
  });

  // Nobody reported, so there is nothing to explain — an absent project isn't
  // an excluded one.
  it("has nothing to exclude when a project reported nothing", () => {
    const silent = { id: "z", name: "Silent co", currency: "EUR", packs: [] };
    const summary = summariseFinancials([silent], options);
    expect(summary.excluded).toEqual([]);
    expect(summary.topBaseTotal).toBeNull();
  });

  it("has no totals at all before any figures are in", () => {
    const summary = summariseFinancials([], options);
    expect(summary.topBaseTotal).toBeNull();
    expect(summary.marginBase).toBeNull();
  });

  it("leaves both lines empty when no fields have been chosen", () => {
    const summary = summariseFinancials([kuwaiti], { ...options, topId: null, bottomId: null });
    expect(summary.rows[0].top).toEqual([null, null]);
    expect(summary.topBaseTotal).toBeNull();
  });

  it("collects every month any project has figures for", () => {
    expect(financialMonths([kuwaiti, american])).toEqual(["2026-01", "2026-02"]);
    expect(financialMonths([])).toEqual([]);
  });
});

describe("draftToValues", () => {
  it("saves a filled cell against the first of its month", () => {
    const draft = new Map([["revenue|2026-03", { numberValue: 300, dateValue: null }]]);
    expect(draftToValues(draft, registry)).toEqual([
      { metricId: "revenue", month: month(2026, 3), numberValue: 300, dateValue: null },
    ]);
  });

  // Otherwise an untouched grid would file a year of zeroes.
  it("drops a cell nobody filled instead of saving a zero", () => {
    const draft = new Map([
      ["revenue|2026-03", { numberValue: null, dateValue: null }],
      ["revenue|2026-04", { numberValue: 0, dateValue: null }],
    ]);
    const rows = draftToValues(draft, registry);
    expect(rows).toHaveLength(1);
    expect(rows[0].numberValue).toBe(0);
  });

  it("never saves a calculated field, which is read and not entered", () => {
    const draft = new Map([["gross|2026-03", { numberValue: 60, dateValue: null }]]);
    expect(draftToValues(draft, registry)).toEqual([]);
  });

  it("saves a date field into its date column", () => {
    const dated = new Map<string, MetricDef>([["closed", { id: "closed", type: "DATE" }]]);
    const draft = new Map([
      ["closed|2026-03", { numberValue: null, dateValue: "2026-03-28T00:00:00.000Z" }],
    ]);
    expect(draftToValues(draft, dated)).toEqual([
      {
        metricId: "closed",
        month: month(2026, 3),
        numberValue: null,
        dateValue: "2026-03-28T00:00:00.000Z",
      },
    ]);
  });

  it("ignores a cell for a field that has left the registry", () => {
    const draft = new Map([["ghost|2026-03", { numberValue: 1, dateValue: null }]]);
    expect(draftToValues(draft, registry)).toEqual([]);
  });
});

describe("publishedPacks", () => {
  const filed = { ...pack("filed", month(2026, 4), [["revenue", month(2026, 1), 100]]), publishedAt: month(2026, 4) };
  const beingEntered = { ...pack("entering", month(2026, 7), [] as [string, string, number][]), publishedAt: null };

  it("leaves out a pack that is still being entered", () => {
    expect(publishedPacks([filed, beingEntered]).map((p) => p.id)).toEqual(["filed"]);
  });

  // The point of the whole thing: an unpublished July sitting in front of a
  // published April must not reach into April on its way to being finished.
  it("stops an unpublished pack restating a month that was published", () => {
    const restating = {
      ...pack("restating", month(2026, 7), [["revenue", month(2026, 1), 999]]),
      publishedAt: null,
    };

    const withDraft = resolveMonthlySeries(publishedPacks([filed, restating]));
    expect(figureAt(withDraft, "revenue", "2026-01")?.numberValue).toBe(100);

    // And once it is published, it does restate it.
    const published = resolveMonthlySeries(
      publishedPacks([filed, { ...restating, publishedAt: month(2026, 7) }]),
    );
    expect(figureAt(published, "revenue", "2026-01")?.numberValue).toBe(999);
  });

  it("counts a pack that says nothing about publishing as published", () => {
    expect(publishedPacks([pack("plain", month(2026, 4), [])]).map((p) => p.id)).toEqual([
      "plain",
    ]);
  });
});

describe("packCellsToValues", () => {
  it("reads a typed figure, thousands separators and all", () => {
    expect(packCellsToValues({ "revenue|2026-03": " 14,032 " }, registry)).toEqual([
      { metricId: "revenue", month: month(2026, 3), numberValue: 14032, dateValue: null },
    ]);
  });

  // A draft holds what was typed, so it holds half-typed things too. Publishing
  // has to skip them rather than store a nonsense figure or refuse the pack.
  it("skips a blank and a cell that never became a number", () => {
    expect(
      packCellsToValues(
        { "revenue|2026-03": "  ", "cost|2026-03": "-", "ga|2026-03": "0" },
        registry,
      ),
    ).toEqual([
      { metricId: "ga", month: month(2026, 3), numberValue: 0, dateValue: null },
    ]);
  });

  it("never stores a calculated field, which is worked out when it is read", () => {
    expect(packCellsToValues({ "gross|2026-03": "60" }, registry)).toEqual([]);
  });

  it("ignores a cell for a field that has since been deleted", () => {
    expect(packCellsToValues({ "ghost|2026-03": "5" }, registry)).toEqual([]);
  });

  it("ignores a malformed key rather than throwing on it", () => {
    expect(packCellsToValues({ revenue: "5", "revenue|nonsense": "5" }, registry)).toEqual([]);
  });

  it("stores a date field as a date", () => {
    const dated = new Map<string, MetricDef>([["closed", { id: "closed", type: "DATE" }]]);
    expect(packCellsToValues({ "closed|2026-03": "2026-03-28" }, dated)).toEqual([
      { metricId: "closed", month: month(2026, 3), numberValue: null, dateValue: "2026-03-28" },
    ]);
  });
});

describe("parsePastedNumber", () => {
  it("reads the notation a management report is written in", () => {
    expect(parsePastedNumber("1,234,567")).toBe(1234567);
    expect(parsePastedNumber("KD 4,500.50")).toBe(4500.5);
    expect(parsePastedNumber("-250")).toBe(-250);
  });

  // Accountants write a loss in brackets, and reading it as positive would flip
  // the sign of every cost line copied off a P&L.
  it("reads brackets as a negative, the way a P&L writes a loss", () => {
    expect(parsePastedNumber("(3,275)")).toBe(-3275);
  });

  it("has no number for a blank or a dash", () => {
    expect(parsePastedNumber("")).toBeNull();
    expect(parsePastedNumber("  ")).toBeNull();
    expect(parsePastedNumber("—")).toBeNull();
    expect(parsePastedNumber("-")).toBeNull();
    expect(parsePastedNumber("n/a")).toBeNull();
  });
});
