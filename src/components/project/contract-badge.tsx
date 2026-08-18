"use client";

import { format, isFuture, isWithinInterval } from "date-fns";

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  FULL_TEAM: "Full Team",
  PART_TEAM: "Part Team",
  FIXED: "Fixed",
  MAINTENANCE: "Maintenance",
  STARTUP: "Startup",
};

interface Contract {
  id: string;
  label: string | null;
  code?: string | null;
  contractType: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
}

export function ContractBadge({ contract }: { contract: Contract }) {
  let status: "active" | "upcoming" | "expired";
  if (contract.startDate && contract.endDate) {
    const now = new Date();
    const start = new Date(contract.startDate);
    const end = new Date(contract.endDate);
    end.setHours(23, 59, 59, 999);
    if (isWithinInterval(now, { start, end })) {
      status = "active";
    } else if (isFuture(start)) {
      status = "upcoming";
    } else {
      status = "expired";
    }
  } else {
    status = "expired";
  }

  const variants = {
    active: "bg-success/15 text-success border-success/20",
    upcoming: "bg-primary/15 text-primary border-primary/20",
    expired: "bg-destructive/15 text-destructive border-destructive/20",
  };

  const typeLabel = CONTRACT_TYPE_LABELS[contract.contractType];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${variants[status]}`}
      >
        {status === "active" && "Active"}
        {status === "upcoming" && "Upcoming"}
        {status === "expired" && "Expired"}
      </span>
      {typeLabel && (
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {typeLabel}
        </span>
      )}
      {contract.code && (
        <span className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-mono font-semibold text-foreground">
          {contract.code}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {contract.label && `${contract.label} · `}
        {contract.startDate && contract.endDate
          ? `${format(new Date(contract.startDate), "MMM d, yyyy")} — ${format(new Date(contract.endDate), "MMM d, yyyy")}`
          : "No dates"}
      </span>
    </div>
  );
}
