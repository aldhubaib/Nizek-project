/**
 * How a market size is written down and read back.
 *
 * A tier is a number, a scale and a currency rather than a line of text. The
 * three of them together are the only way two tiers can be compared — drawing
 * a billion inside a total means multiplying the scale out, and reading it back
 * to someone means putting the scale back. Both live here so the form, the
 * report and the history can't disagree about what a row says.
 */

export type MarketUnit = "THOUSAND" | "MILLION" | "BILLION" | "TRILLION";

export const MARKET_UNITS: { key: MarketUnit; label: string; factor: number }[] =
  [
    { key: "THOUSAND", label: "thousand", factor: 1_000 },
    { key: "MILLION", label: "million", factor: 1_000_000 },
    { key: "BILLION", label: "billion", factor: 1_000_000_000 },
    { key: "TRILLION", label: "trillion", factor: 1_000_000_000_000 },
  ];

/** The ones we deal in, ours first. A market counted in anything else is typed
 * in as the code and kept; this list is what the picker offers, not a rule. */
export const MARKET_CURRENCIES = [
  "KWD",
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "QAR",
  "BHD",
  "OMR",
  "EGP",
];

export type MarketAmount = {
  value: number | null;
  unit: string | null;
  currency: string | null;
};

function unitOf(unit: string | null) {
  return MARKET_UNITS.find((u) => u.key === unit) ?? null;
}

/** The amount as one number, for sizing tiers against each other. Nothing to
 * read gives 0, which is the signal not to draw it rather than a size. */
export function marketAmount({ value, unit }: MarketAmount): number {
  if (value == null) return 0;
  return value * (unitOf(unit)?.factor ?? 1);
}

/**
 * The amount as it should be read: "USD 1.3 billion". The scale stays a word
 * rather than being multiplied out, since that is how the figure is said and
 * how it was entered.
 */
export function formatMarketAmount({ value, unit, currency }: MarketAmount) {
  if (value == null) return "—";
  return [currency, value.toLocaleString("en-US"), unitOf(unit)?.label]
    .filter(Boolean)
    .join(" ");
}
