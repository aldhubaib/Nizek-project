import Link from "next/link";
import { ArrowLeft, Clock, Sparkles, Zap, Bug, AlertCircle, Palette, StickyNote } from "lucide-react";
import { getClientDependencies } from "@/actions/dashboard";
import { cn } from "@/lib/utils";

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const STAGE_LABELS: Record<string, string> = {
  NEW_REQUEST: "New Request",
  CLARIFICATION: "Clarification",
  READY_FOR_DEV: "Ready for Dev",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  READY_FOR_RELEASE: "Ready for Release",
  DONE: "Done",
};

export default async function WaitingOnClientPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const data = await getClientDependencies();

  const totalTasks = data.reduce((s, g) => s + g.tasks.length, 0);
  const backHref = tab ? `/dashboard?tab=${tab}` : "/dashboard";
  const prefix = tab === "product" ? "PM" : tab === "dev" ? "Dev" : "";

  return (
    <div>
      <div className="sticky top-0 z-10 flex app-top-bar items-center justify-between px-6 pr-14 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[13px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <span className="text-border">|</span>
          <h1 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {prefix} Waiting on Client
          </h1>
          <span className="text-[11px] text-muted-foreground">
            ({totalTasks} tasks across {data.length} projects)
          </span>
        </div>
        {totalTasks > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
            {totalTasks} pending
          </span>
        )}
      </div>

      <div className="px-6 py-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/20 mb-3" strokeWidth={1.5} />
            <p className="text-[13px] text-muted-foreground">Nothing waiting on client</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((group) => (
              <div key={group.project.id} className="rounded-xl border border-border bg-card divide-y divide-border">
                <div className="px-5 py-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold">{group.project.name}</h3>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_100px_110px_1fr] gap-3 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  <span>Task</span>
                  <span>Stage</span>
                  <span>Assignee</span>
                  <span>Note</span>
                </div>
                {group.tasks.map((item) => {
                  const typeInfo = TASK_TYPE_ICONS[item.task.taskType];
                  const TypeIcon = typeInfo?.icon ?? Sparkles;
                  return (
                    <Link
                      key={item.task.id}
                      href={`/dashboard/projects/${item.task.project.id}/tasks/${item.task.id}`}
                      target="_blank"
                      className="grid grid-cols-[1fr_100px_110px_1fr] gap-3 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
                          <TypeIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">{item.task.title}</p>
                          <p className="text-[10px] text-muted-foreground/50">
                            <span className="font-mono">#{item.task.taskNumber}</span>
                            <span className="mx-1">·</span>
                            {item.task.project.name}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate">{STAGE_LABELS[item.task.stage] ?? item.task.stage}</span>
                      <span className="text-[11px] text-muted-foreground truncate">{item.task.assignee?.name ?? "Unassigned"}</span>
                      <p className="text-[11px] text-muted-foreground/60 truncate italic flex items-center gap-1">
                        {item.note ? (
                          <>
                            <StickyNote className="w-3 h-3 text-amber-400/60 shrink-0" />
                            {item.note}
                          </>
                        ) : "—"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
