"use client";

import { format, isFuture, isWithinInterval } from "date-fns";

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  FULL_TEAM: "Full Team",
  PART_TEAM: "Part Team",
  FIXED: "Fixed",
  MAINTENANCE: "Maintenance",
};

interface Contract {
  id: string;
  label: string | null;
  contractType: string;
  startDate: Date;
  endDate: Date;
}

export function ContractBadge({ contract }: { contract: Contract }) {
  const now = new Date();
  const start = new Date(contract.startDate);
  const end = new Date(contract.endDate);

  let status: "active" | "upcoming" | "expired";
  if (isWithinInterval(now, { start, end })) {
    status = "active";
  } else if (isFuture(start)) {
    status = "upcoming";
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
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${variants[status]}`}
      >
        {status === "active" && "Active"}
        {status === "upcoming" && "Upcoming"}
        {status === "expired" && "Expired"}
      </span>
      {typeLabel && (
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {typeLabel}
        </span>
      )}
      <span className="text-[11px] text-muted-foreground">
        {contract.label && `${contract.label} · `}
        {format(start, "MMM d, yyyy")} — {format(end, "MMM d, yyyy")}
      </span>
    </div>
  );
}
