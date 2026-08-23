"use client";

import { format, isFuture, isWithinInterval } from "date-fns";
import { StatusBadge, type BadgeConfig } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  FULL_TEAM: "Full Team",
  PART_TEAM: "Part Team",
  FIXED: "Fixed",
  MAINTENANCE: "Maintenance",
  STARTUP: "Startup",
};

const STATUS_CONFIG: Record<string, BadgeConfig> = {
  active: outlineBadge("Active", "text-success", "border-success/30"),
  upcoming: outlineBadge("Upcoming", "text-primary", "border-primary/30"),
  expired: outlineBadge("Expired", "text-destructive", "border-destructive/30"),
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

  const typeLabel = CONTRACT_TYPE_LABELS[contract.contractType];

  return (
    <div className="flex items-center gap-2">
      <StatusBadge config={STATUS_CONFIG[status]} />
      {typeLabel && (
        <StatusBadge config={outlineBadge(typeLabel, "text-muted-foreground", "border-border")} />
      )}
      {contract.code && (
        <StatusBadge config={outlineBadge(contract.code, "text-foreground", "border-border")} className="font-mono" />
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
