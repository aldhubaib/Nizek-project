"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowRight, FileText, AlertTriangle, X, ExternalLink, Users, UserMinus, Wrench, Rocket, Briefcase, ArrowRightLeft } from "lucide-react";
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
  if (days === null) return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", bar: "bg-muted" };
  if (days <= 0) return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", bar: "bg-red-500" };
  if (days < 30) return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", bar: "bg-red-500" };
  if (days < 90) return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", bar: "bg-amber-500" };
  return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", bar: "bg-emerald-500" };
}

function formatEndDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getBarWidth(days: number | null, maxDays: number) {
  if (days === null || maxDays <= 0) return 0;
  return Math.min(100, Math.max(4, (days / maxDays) * 100));
}

const CONTRACT_TYPE_ICONS: Record<string, { icon: typeof Users; color: string }> = {
  FULL_TEAM: { icon: Users, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  PART_TEAM: { icon: UserMinus, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  FIXED: { icon: Briefcase, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  MAINTENANCE: { icon: Wrench, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  STARTUP: { icon: Rocket, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
};

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-popover border border-border text-[10px] text-popover-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
      </div>
    </div>
  );
}

const PREVIEW_COUNT = 5;

function CompactRow({ item, maxDays }: { item: ContractHealthItem; maxDays: number }) {
  const colors = getDaysColor(item.daysLeft);
  const barW = getBarWidth(item.daysLeft, maxDays);
  const typeInfo = item.currentType ? CONTRACT_TYPE_ICONS[item.currentType] : null;
  const TypeIcon = typeInfo?.icon ?? FileText;

  return (
    <Link href={`/dashboard/projects/${item.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group">
      {item.logoUrl ? (
        <img src={item.logoUrl} alt="" className="w-6 h-6 rounded-md object-cover border border-border shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
          {item.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Tooltip text={CONTRACT_TYPE_LABELS[item.currentType ?? ""] ?? "Unknown"}>
              <div className={cn("w-5 h-5 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
                <TypeIcon className="w-3 h-3" />
              </div>
            </Tooltip>
            {item.typeTransition && (
              <Tooltip text={`Switching: ${CONTRACT_TYPE_LABELS[item.typeTransition.from]} → ${CONTRACT_TYPE_LABELS[item.typeTransition.to]}`}>
                <div className="w-5 h-5 rounded flex items-center justify-center border shrink-0 text-amber-400 bg-amber-500/10 border-amber-500/20 animate-pulse">
                  <ArrowRightLeft className="w-3 h-3" />
                </div>
              </Tooltip>
            )}
            <p className="text-[12px] font-medium truncate group-hover:text-primary transition-colors">{item.name}</p>
          </div>
          <span className={cn("text-[11px] font-bold tabular-nums shrink-0", colors.text)}>
            {item.daysLeft !== null ? (item.daysLeft <= 0 ? "Expired" : `${item.daysLeft}d`) : "—"}
          </span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", colors.bar)} style={{ width: `${barW}%` }} />
        </div>
      </div>
    </Link>
  );
}

function FullRow({ item }: { item: ContractHealthItem }) {
  const colors = getDaysColor(item.daysLeft);
  const typeInfo = item.currentType ? CONTRACT_TYPE_ICONS[item.currentType] : null;
  const TypeIcon = typeInfo?.icon ?? FileText;

  return (
    <Link
      href={`/dashboard/projects/${item.id}`}
      className="grid grid-cols-[1fr_90px_130px_150px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        {item.logoUrl ? (
          <img src={item.logoUrl} alt="" className="w-7 h-7 rounded-lg object-cover border border-border shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
            {item.name.charAt(0).toUpperCase()}
          </div>
        )}
        <Tooltip text={CONTRACT_TYPE_LABELS[item.currentType ?? ""] ?? "Unknown"}>
          <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
            <TypeIcon className="w-3.5 h-3.5" />
          </div>
        </Tooltip>
        {item.typeTransition && (
          <Tooltip text={`Switching: ${CONTRACT_TYPE_LABELS[item.typeTransition.from]} → ${CONTRACT_TYPE_LABELS[item.typeTransition.to]}`}>
            <div className="w-6 h-6 rounded flex items-center justify-center border shrink-0 text-amber-400 bg-amber-500/10 border-amber-500/20">
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </div>
          </Tooltip>
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">{item.name}</p>
          {item.contractCode && <p className="text-[10px] text-muted-foreground/50 font-mono truncate">{item.contractCode}</p>}
        </div>
      </div>

      <div className="flex justify-center">
        <span className={cn("inline-flex items-center justify-center min-w-[48px] rounded-full px-2 py-0.5 text-[12px] font-bold border tabular-nums", colors.bg, colors.text, colors.border)}>
          {item.daysLeft !== null ? (item.daysLeft <= 0 ? "Expired" : `${item.daysLeft}d`) : "—"}
        </span>
      </div>

      <div className="flex items-center justify-center gap-1.5 min-w-0">
        {item.typeTransition ? (
          <>
            <span className="text-[11px] font-medium text-muted-foreground truncate">{CONTRACT_TYPE_LABELS[item.typeTransition.from] ?? item.typeTransition.from}</span>
            <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-400 truncate">{CONTRACT_TYPE_LABELS[item.typeTransition.to] ?? item.typeTransition.to}</span>
          </>
        ) : (
          <span className="text-[11px] font-medium text-muted-foreground">{item.currentType ? (CONTRACT_TYPE_LABELS[item.currentType] ?? item.currentType) : "—"}</span>
        )}
      </div>

      <div className="text-right">
        <span className={cn("text-[12px] tabular-nums", colors.text)}>{item.endDate ? formatEndDate(item.endDate) : "—"}</span>
        {item.contractCount > 1 && <p className="text-[10px] text-muted-foreground/40">{item.contractCount} contracts</p>}
      </div>
    </Link>
  );
}

export function ContractsHealth({ data }: { data: ContractHealthItem[] }) {
  const [showAll, setShowAll] = useState(false);

  const urgentCount = data.filter((d) => d.daysLeft !== null && d.daysLeft < 90).length;
  const healthyCount = data.filter((d) => d.daysLeft !== null && d.daysLeft >= 90).length;
  const criticalCount = data.filter((d) => d.daysLeft !== null && d.daysLeft < 30).length;
  const maxDays = Math.max(...data.map((d) => d.daysLeft ?? 0), 1);
  const preview = data.slice(0, PREVIEW_COUNT);

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[14px] font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Contracts Health
            </h2>
            {urgentCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                {urgentCount} soon
              </span>
            )}
          </div>
          {/* Summary bar */}
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">{healthyCount} healthy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">{urgentCount - criticalCount} expiring</span>
            </div>
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">{criticalCount} critical</span>
              </div>
            )}
          </div>
        </div>

        {/* Preview rows */}
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-muted-foreground">No active contracts</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {preview.map((item) => (
              <CompactRow key={item.id} item={item} maxDays={maxDays} />
            ))}
          </div>
        )}

        {/* View All */}
        {data.length > PREVIEW_COUNT && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 border-t border-border text-[12px] font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" />
            View All ({data.length})
          </button>
        )}
      </div>

      {/* Full overlay */}
      {showAll && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowAll(false)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[13px]">
                <X className="w-4 h-4" />
                Close
              </button>
              <span className="text-border">|</span>
              <h2 className="text-[13px] font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Contracts Health
                <span className="text-[11px] font-normal text-muted-foreground">({data.length} projects)</span>
              </h2>
            </div>
            {urgentCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                {urgentCount} expiring soon
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-4">
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                <div className="grid grid-cols-[1fr_90px_130px_150px] gap-4 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  <span>Project</span>
                  <span className="text-center">Days Left</span>
                  <span className="text-center">Contract Type</span>
                  <span className="text-right">Ends</span>
                </div>
                {data.map((item) => (
                  <FullRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
