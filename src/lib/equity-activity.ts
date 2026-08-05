import "server-only";
import { prisma } from "@/lib/prisma";
import type { EquityChange } from "@/lib/equity-diff";

/**
 * Writing down who changed what, as the equity actions save.
 *
 * Everything is recorded as text in the words the form uses, because a history
 * is read rather than recomputed: "Valuation 500,000 → 750,000 KWD" is the
 * point, and storing it as numbers would only mean formatting it back later
 * against a currency that may since have changed.
 *
 * Working out *what* changed is @/lib/equity-diff — no database, and tested.
 */

export const EQUITY_SECTIONS = {
  PORTFOLIO: "Portfolio",
  OPPORTUNITY: "Opportunity",
  PRODUCT: "The product",
  MARKET_VALIDATION: "Market validation",
  MARKET: "Market size",
  BUSINESS_MODEL: "Business model",
  MARKET_ADOPTION: "Market adoption",
  TRACTION: "Traction",
  COMPETITION: "Competition",
  CONTRACTS: "Contracts",
  EQUITY: "Equity",
  FINANCIALS: "Financials",
  PERFORMANCE: "Performance",
  TEAM: "Team",
  TRANCHES: "Dilution tranches",
} as const;

export type EquitySection = keyof typeof EQUITY_SECTIONS;
export type EquityAction = "created" | "updated" | "deleted" | "restored";

/**
 * Writes one history entry per changed field. A save that changed nothing
 * writes nothing — an untouched form shouldn't leave a mark.
 */
export async function logEquityChanges(entry: {
  portfolioId: string;
  userId: string;
  section: EquitySection;
  action: EquityAction;
  subject?: string | null;
  changes: EquityChange[];
}) {
  if (entry.changes.length === 0) return;
  await prisma.equityActivity.createMany({
    data: entry.changes.map((change) => ({
      portfolioId: entry.portfolioId,
      userId: entry.userId,
      section: entry.section,
      action: entry.action,
      subject: entry.subject ?? null,
      label: change.label,
      oldValue: change.old,
      newValue: change.new,
    })),
  });
}

/** A single entry, for changes that aren't about one field — a row added, a row gone. */
export async function logEquityEvent(entry: {
  portfolioId: string;
  userId: string;
  section: EquitySection;
  action: EquityAction;
  subject?: string | null;
  label?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await prisma.equityActivity.create({
    data: {
      portfolioId: entry.portfolioId,
      userId: entry.userId,
      section: entry.section,
      action: entry.action,
      subject: entry.subject ?? null,
      label: entry.label ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
    },
  });
}
