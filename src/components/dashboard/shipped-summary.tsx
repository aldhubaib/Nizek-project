"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { CheckCircle2, X, ExternalLink, Sparkles, Zap, Bug, AlertCircle, Palette, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ShippedData {
  total: number;
  typeBreakdown: { type: string; count: number }[];
  projectBreakdown: { id: string; name: string; count: number }[];
  recentShipped: {
    id: string;
    title: string;
    taskNumber: number;
    taskType: string;
    updatedAt: Date | string;
    project: { id: string; name: string };
    assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  }[];
}

const TYPE_CONFIG: Record<string, { icon: typeof Sparkles; color: string; bg: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", label: "Business Cases" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", label: "Enhancements" },
  BUG: { icon: Bug, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", label: "Bugs Fixed" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", label: "Reported Bugs" },
  DESIGN: { icon: Palette, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", label: "Designs" },
};

function getBarWidth(count: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(4, (count / max) * 100));
}

export function ShippedSummary({ data }: { data: ShippedData }) {
  const [showAll, setShowAll] = useState(false);

  const maxTypeCount = data.typeBreakdown.length > 0 ? Math.max(...data.typeBreakdown.map((t) => t.count)) : 0;

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[14px] font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              Shipped
            </h2>
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
              <CheckCircle2 className="w-3 h-3" />
              {data.total} done
            </span>
          </div>
          {/* Mini project breakdown */}
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            {data.projectBreakdown.slice(0, 4).map((p) => (
              <span key={p.id} className="text-muted-foreground">
                {p.name}: <span className="font-semibold text-foreground">{p.count}</span>
              </span>
            ))}
            {data.projectBreakdown.length > 4 && (
              <span className="text-muted-foreground/50">+{data.projectBreakdown.length - 4} more</span>
            )}
          </div>
        </div>

        {/* Type breakdown cards */}
        {data.total === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-muted-foreground">Nothing shipped yet</p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {data.typeBreakdown.map((item) => {
              const cfg = TYPE_CONFIG[item.type];
              const Icon = cfg?.icon ?? Sparkles;
              const barW = getBarWidth(item.count, maxTypeCount);

              return (
                <div key={item.type} className="flex items-center gap-3">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center border shrink-0", cfg?.bg ?? "bg-muted border-border")}>
                    <Icon className={cn("w-3.5 h-3.5", cfg?.color ?? "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium">{cfg?.label ?? item.type}</span>
                      <span className={cn("text-[13px] font-bold tabular-nums", cfg?.color ?? "text-foreground")}>{item.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", cfg?.color.replace("text-", "bg-") ?? "bg-muted-foreground")}
                        style={{ width: `${barW}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View All */}
        {data.recentShipped.length > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 border-t border-border text-[12px] font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" />
            View Recent ({data.recentShipped.length})
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
                <Package className="w-4 h-4 text-muted-foreground" />
                Shipped Tasks
                <span className="text-[11px] font-normal text-muted-foreground">({data.total} total)</span>
              </h2>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
              <CheckCircle2 className="w-3 h-3" />
              {data.total} done
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-4">
              {/* Summary cards */}
              <div className="grid grid-cols-5 gap-3 mb-4">
                {data.typeBreakdown.map((item) => {
                  const cfg = TYPE_CONFIG[item.type];
                  const Icon = cfg?.icon ?? Sparkles;
                  return (
                    <div key={item.type} className={cn("rounded-xl border p-3 text-center", cfg?.bg ?? "bg-muted border-border")}>
                      <Icon className={cn("w-5 h-5 mx-auto mb-1", cfg?.color ?? "text-muted-foreground")} />
                      <p className={cn("text-[18px] font-bold tabular-nums", cfg?.color ?? "text-foreground")}>{item.count}</p>
                      <p className="text-[10px] text-muted-foreground">{cfg?.label ?? item.type}</p>
                    </div>
                  );
                })}
              </div>

              {/* Recent list */}
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                <div className="grid grid-cols-[1fr_100px_120px_100px] gap-4 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  <span>Task</span>
                  <span>Project</span>
                  <span>Type</span>
                  <span className="text-right">Completed</span>
                </div>
                {data.recentShipped.map((task) => {
                  const cfg = TYPE_CONFIG[task.taskType];
                  const Icon = cfg?.icon ?? Sparkles;
                  return (
                    <Link
                      key={task.id}
                      href={`/dashboard/projects/${task.project.id}?task=${task.id}`}
                      className="grid grid-cols-[1fr_100px_120px_100px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", cfg?.bg ?? "bg-muted border-border")}>
                          <Icon className={cn("w-3.5 h-3.5", cfg?.color ?? "text-muted-foreground")} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">{task.title}</p>
                          <p className="text-[10px] text-muted-foreground/50 font-mono">#{task.taskNumber}</p>
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate">{task.project.name}</span>
                      <span className={cn("text-[11px] font-medium", cfg?.color ?? "text-muted-foreground")}>{cfg?.label ?? task.taskType}</span>
                      <span className="text-[11px] text-muted-foreground text-right">
                        {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
