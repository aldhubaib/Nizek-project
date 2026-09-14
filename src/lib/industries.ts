/**
 * The industries a company may be filed under.
 *
 * A fixed list rather than free text, for the same reason `board-palette.ts`
 * fixes its colours: "Fintech", "FinTech" and "fin-tech" typed by three people
 * are three industries as far as a query is concerned, and being able to ask
 * for every company in one is the whole point of the field.
 *
 * What is stored on the row is the `id`. Renaming a label is a change here and
 * nowhere else. Ids are never reused for a different industry, since existing
 * rows point at them.
 */

export interface Industry {
  id: string;
  label: string;
}

/**
 * Alphabetical by label, except "Other" which is pinned last — it is the
 * fallback, not a choice between A and B.
 */
export const INDUSTRIES: Industry[] = [
  { id: "advertising", label: "Advertising & Marketing" },
  { id: "agriculture", label: "Agriculture" },
  { id: "automotive", label: "Automotive" },
  { id: "aviation", label: "Aviation" },
  { id: "banking", label: "Banking" },
  { id: "construction", label: "Construction" },
  { id: "consulting", label: "Consulting" },
  { id: "education", label: "Education" },
  { id: "energy", label: "Energy & Utilities" },
  { id: "engineering", label: "Engineering" },
  { id: "entertainment", label: "Entertainment & Media" },
  { id: "fashion", label: "Fashion & Apparel" },
  { id: "financial_services", label: "Financial Services" },
  { id: "fintech", label: "Fintech" },
  { id: "food_beverage", label: "Food & Beverage" },
  { id: "government", label: "Government & Public Sector" },
  { id: "healthcare", label: "Healthcare" },
  { id: "hospitality", label: "Hospitality & Tourism" },
  { id: "insurance", label: "Insurance" },
  { id: "legal", label: "Legal" },
  { id: "logistics", label: "Logistics & Shipping" },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "mining", label: "Mining & Metals" },
  { id: "nonprofit", label: "Non-profit & NGO" },
  { id: "oil_gas", label: "Oil & Gas" },
  { id: "pharmaceuticals", label: "Pharmaceuticals" },
  { id: "real_estate", label: "Real Estate" },
  { id: "retail", label: "Retail & E-commerce" },
  { id: "software", label: "Software & IT" },
  { id: "sports", label: "Sports & Fitness" },
  { id: "telecom", label: "Telecommunications" },
  { id: "transportation", label: "Transportation" },
  { id: "other", label: "Other" },
];

const BY_ID = new Map(INDUSTRIES.map((industry) => [industry.id, industry]));

export function isIndustry(id: string): boolean {
  return BY_ID.has(id);
}

/** Unknown ids show as themselves rather than rendering an empty cell. */
export function industryLabel(id: string | null | undefined): string {
  if (!id) return "";
  return BY_ID.get(id)?.label ?? id;
}
