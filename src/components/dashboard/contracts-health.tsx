"use client";

import Link from "next/link";
import { ArrowRight, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  FULL_TEAM: "Full Team",
  PART_TEAM: "Part Team",
  FIXED: "Fixed",
  MAINTENANCE: "Maintenance",
  STARTUP: "Startup",
};

interface ContractHealthItem {
  id: string;
  name: string;
  logoUrl: string | null;
  daysLeft: number | null;
  endDate: string | null;
  currentType: string | null;
  contractCode: string | null;
  typeTransition: { from: string; to: string } | null;
  contractCount: number;
}

function getDaysColor(days: number | null) {
  if (days === null) return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  if (days <= 0) return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" };
  if (days < 30) return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" };
  if (days < 90) return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" };
  return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" };
}

function formatEndDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ContractsHealth({ data }: { data: ContractHealthItem[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-[14px] font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          Contracts Health
        </h2>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground">No active contracts found.</p>
        </div>
      </div>
    );
  }

  const urgentCount = data.filter((d) => d.daysLeft !== null && d.daysLeft < 90).length;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-[14px] font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          Contracts Health
          <span className="text-[11px] font-normal text-muted-foreground">
            ({data.length} project{data.length !== 1 ? "s" : ""})
          </span>
        </h2>
        {urgentCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
            <AlertTriangle className="w-3 h-3" />
            {urgentCount} expiring soon
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_140px_180px] gap-4 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
          <span>Project</span>
          <span className="text-center">Days Left</span>
          <span className="text-center">Contract Type</span>
          <span className="text-right">Ends</span>
        </div>

        {data.map((item) => {
          const colors = getDaysColor(item.daysLeft);

          return (
            <Link
              key={item.id}
              href={`/dashboard/projects/${item.id}`}
              className="grid grid-cols-[1fr_100px_140px_180px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
            >
              {/* Project Name */}
              <div className="flex items-center gap-3 min-w-0">
                {item.logoUrl ? (
                  <img
                    src={item.logoUrl}
                    alt=""
                    className="w-7 h-7 rounded-lg object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">
                    {item.name}
                  </p>
                  {item.contractCode && (
                    <p className="text-[10px] text-muted-foreground/50 font-mono truncate">
                      {item.contractCode}
                    </p>
                  )}
                </div>
              </div>

              {/* Days Left */}
              <div className="flex justify-center">
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[52px] rounded-full px-2.5 py-1 text-[12px] font-bold border tabular-nums",
                    colors.bg,
                    colors.text,
                    colors.border
                  )}
                >
                  {item.daysLeft !== null
                    ? item.daysLeft <= 0
                      ? "Expired"
                      : `${item.daysLeft}d`
                    : "—"}
                </span>
              </div>

              {/* Contract Type + Transition */}
              <div className="flex items-center justify-center gap-1.5 min-w-0">
                {item.typeTransition ? (
                  <>
                    <span className="text-[11px] font-medium text-muted-foreground truncate">
                      {CONTRACT_TYPE_LABELS[item.typeTransition.from] ?? item.typeTransition.from}
                    </span>
                    <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-amber-400 truncate">
                      {CONTRACT_TYPE_LABELS[item.typeTransition.to] ?? item.typeTransition.to}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {item.currentType ? (CONTRACT_TYPE_LABELS[item.currentType] ?? item.currentType) : "—"}
                  </span>
                )}
              </div>

              {/* End Date */}
              <div className="text-right">
                <span className={cn("text-[12px] tabular-nums", colors.text)}>
                  {item.endDate ? formatEndDate(item.endDate) : "—"}
                </span>
                {item.contractCount > 1 && (
                  <p className="text-[10px] text-muted-foreground/40">
                    {item.contractCount} contracts
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
