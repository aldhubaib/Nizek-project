"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Hourglass, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAwaitingDevelopment } from "@/actions/dashboard";

type AwaitingData = Awaited<ReturnType<typeof getAwaitingDevelopment>>;
type AwaitingTask = AwaitingData["tasks"][number];

const STAGE_STYLE: Record<string, { label: string; text: string; dot: string }> = {
  CLARIFICATION: { label: "Clarification", text: "text-violet-400", dot: "bg-violet-400" },
  READY_FOR_DEV: { label: "Ready for Dev", text: "text-blue-400", dot: "bg-blue-400" },
};

function waitingLabel(enteredAt: Date | string | null): string {
  if (!enteredAt) return "";
  const ms = Date.now() - new Date(enteredAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function DashboardOverview() {
  const [data, setData] = useState<AwaitingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        setData(await getAwaitingDevelopment());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      }
    });
  }, []);

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, AwaitingTask[]>();
    for (const t of data.tasks) {
      const list = map.get(t.stage) ?? [];
      list.push(t);
      map.set(t.stage, list);
    }
    // Mine first within each stage
    for (const list of map.values()) {
      list.sort((a, b) => Number(b.mine) - Number(a.mine));
    }
    return ["CLARIFICATION", "READY_FOR_DEV"]
      .filter((s) => map.has(s))
      .map((s) => ({ stage: s, tasks: map.get(s)! }));
  }, [data]);

  return (
    <div className="lg:col-span-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Awaiting Development */}
        <button
          onClick={() => data && setShowDetails(true)}
          disabled={!data}
          className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30 hover:bg-accent/20 disabled:cursor-default"
        >
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Awaiting Development
            </span>
            <Hourglass className="w-4 h-4 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
          </div>
          <div className="mt-2 min-h-[32px]">
            {error ? (
              <span className="text-[11px] text-destructive">{error}</span>
            ) : data ? (
              <span className="text-[26px] font-bold leading-none tabular-nums">
                {data.mine}
                <span className="text-muted-foreground/60 font-semibold"> / {data.total}</span>
              </span>
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Yours / all open before development</p>
        </button>

        {/* Empty slots */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-dashed border-border/70 bg-card/40 p-4 flex flex-col"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
              Coming soon
            </span>
            <span className="mt-2 text-[26px] font-bold leading-none text-muted-foreground/20">—</span>
          </div>
        ))}
      </div>

      {/* Details popup */}
      {showDetails && data && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h2 className="text-[16px] font-semibold">
                Awaiting development · {data.mine}
                <span className="text-muted-foreground font-medium"> / {data.total}</span>
              </h2>
              <button
                onClick={() => setShowDetails(false)}
                className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-5">
              {data.total === 0 && (
                <p className="py-8 text-center text-[12px] text-muted-foreground">
                  No tasks are waiting to enter development.
                </p>
              )}

              {grouped.map(({ stage, tasks }) => {
                const style = STAGE_STYLE[stage];
                return (
                  <div key={stage}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("w-1.5 h-1.5 rounded-full", style?.dot ?? "bg-muted-foreground")} />
                      <span className={cn("text-[10px] font-semibold uppercase tracking-[0.15em]", style?.text ?? "text-muted-foreground")}>
                        {style?.label ?? stage}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground">{tasks.length}</span>
                    </div>
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <Link
                          key={task.id}
                          href={`/dashboard/projects/${task.project.id}/tasks/${task.id}`}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-accent/30",
                            task.mine ? "border-primary/30 bg-primary/[0.03]" : "border-border bg-card",
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate">
                              {task.title}
                              {task.mine && (
                                <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5 align-middle">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {task.project.name} · #{task.taskNumber}
                            </p>
                          </div>
                          {task.assignee && (
                            task.assignee.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={task.assignee.imageUrl}
                                alt={task.assignee.name ?? ""}
                                title={task.assignee.name ?? undefined}
                                className="w-7 h-7 rounded-full shrink-0 object-cover"
                              />
                            ) : (
                              <span
                                title={task.assignee.name ?? undefined}
                                className="w-7 h-7 rounded-full shrink-0 bg-blue-500/20 text-blue-300 text-[10px] font-bold flex items-center justify-center"
                              >
                                {initials(task.assignee.name)}
                              </span>
                            )
                          )}
                          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-8 text-right">
                            {waitingLabel(task.enteredAt)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
