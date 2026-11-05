import { format } from "date-fns";

import { CONTRACT_TYPE_LABELS, contractDaysLeft, isContractActiveOnDate } from "@/lib/contract-rules";

/** The contract fields the project screens read; the list and the record both carry them. */
export interface ContractLike {
  id: string;
  label: string | null;
  code: string | null;
  contractType: keyof typeof CONTRACT_TYPE_LABELS;
  startDate: Date | string | null;
  endDate: Date | string | null;
  latePayment: boolean;
}

/**
 * Where a project stands, from its contracts (the same rule as the live panel's project cards
 * and `activeProjectFilter`): `active` with a contract in its window and paid up; `late` with a
 * contract in its window flagged late payment; `upcoming` when the next contract has not
 * started; `archived` with nothing current.
 */
export type ProjectState = "active" | "late" | "upcoming" | "archived";

export interface ProjectStanding {
  state: ProjectState;
  /** The contract the state comes from: the current one, else the next to start, else none. */
  contract: ContractLike | null;
  /** Whole days until the current contract's last day ends, or until the next one starts. */
  days: number | null;
}

export const STATE_LABEL: Record<ProjectState, string> = {
  active: "Active",
  late: "Late payment",
  upcoming: "Upcoming",
  archived: "Archived",
};

export function projectStanding(contracts: ContractLike[], now = new Date()): ProjectStanding {
  const current = contracts.filter((c) => isContractActiveOnDate(c.startDate, c.endDate, now));
  const late = current.find((c) => c.latePayment);
  if (late) return { state: "late", contract: late, days: contractDaysLeft(late.endDate!, now) };
  const paid = current[0];
  if (paid) return { state: "active", contract: paid, days: contractDaysLeft(paid.endDate!, now) };
  const next = contracts
    .filter((c) => c.startDate && new Date(c.startDate) > now)
    .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime())[0];
  if (next) {
    const start = new Date(next.startDate!);
    start.setHours(0, 0, 0, 0);
    return { state: "upcoming", contract: next, days: Math.ceil((start.getTime() - now.getTime()) / 86_400_000) };
  }
  return { state: "archived", contract: null, days: null };
}

/** True for the list's "Active" pill: in a paid-up contract window today (the live panel's rule). */
export const isActiveProject = (contracts: ContractLike[], now = new Date()) => projectStanding(contracts, now).state === "active";

/** One contract's own window: active, late, upcoming or expired. */
export function contractState(c: ContractLike, now = new Date()): "active" | "late" | "upcoming" | "expired" {
  if (isContractActiveOnDate(c.startDate, c.endDate, now)) return c.latePayment ? "late" : "active";
  if (c.startDate && new Date(c.startDate) > now) return "upcoming";
  return "expired";
}

/** "Website redesign", else the code ("NZK-012"), else the type ("Maintenance"). */
export function contractName(c: ContractLike): string {
  return c.label?.trim() || c.code?.trim() || CONTRACT_TYPE_LABELS[c.contractType];
}

/** "12 Jan 2026 – 12 Mar 2027"; an open end reads "from 12 Jan 2026". */
export function contractDates(c: ContractLike): string {
  const start = c.startDate ? format(new Date(c.startDate), "d MMM yyyy") : null;
  const end = c.endDate ? format(new Date(c.endDate), "d MMM yyyy") : null;
  if (start && end) return `${start} – ${end}`;
  if (start) return `from ${start}`;
  if (end) return `until ${end}`;
  return "No dates";
}

/** "128 days left", "Ends today", "Ended 3 days ago", "Starts in 12 days". */
export function daysText(standing: ProjectStanding): string | null {
  const { state, days } = standing;
  if (days == null) return null;
  if (state === "upcoming") return days <= 0 ? "Starts today" : `Starts in ${days} day${days === 1 ? "" : "s"}`;
  if (days <= 0) return "Ends today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}
