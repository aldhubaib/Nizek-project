import Link from "next/link";
import { ArrowLeft, UserCircle2, AlertTriangle, Clock, Sparkles, Zap, Bug, AlertCircle, Palette, StickyNote } from "lucide-react";
import { getTasksNeedingClientInput } from "@/actions/dashboard";
import { cn } from "@/lib/utils";

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const STAGE_COLORS: Record<string, string> = {
  NEW_REQUEST: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  CLARIFICATION: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

function formatDuration(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ${hours % 24}h`;
  return `${days}d`;
}

function getDurationColor(ms: number) {
  const days = ms / (1000 * 60 * 60 * 24);
  if (days >= 7) return "text-red-400";
  if (days >= 5) return "text-amber-400";
  return "text-yellow-400";
}

export default async function NeedsClientInputPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const data = await getTasksNeedingClientInput();

  const backHref = tab ? `/dashboard?tab=${tab}` : "/dashboard";
  const prefix = tab === "product" ? "PM" : tab === "dev" ? "Dev" : "";

  return (
    <div>
      <div className="h-12 sticky top-0 z-10 flex items-center justify-between px-6 pr-14 border-b border-border bg-background shrink-0">
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
            <UserCircle2 className="w-4 h-4 text-muted-foreground" />
            {prefix} Needs Client Input
          </h1>
          <span className="text-[11px] text-muted-foreground">({data.length} tasks)</span>
        </div>
        {data.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
            <AlertTriangle className="w-3 h-3" />
            {data.length} waiting
          </span>
        )}
      </div>

      <div className="px-6 py-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UserCircle2 className="w-8 h-8 text-muted-foreground/20 mb-3" strokeWidth={1.5} />
            <p className="text-[13px] text-muted-foreground">No tasks waiting on client input</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            <div className="grid grid-cols-[1fr_140px_110px_120px_1fr_80px] gap-4 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              <span>Task</span>
              <span>Assignee</span>
              <span>Project</span>
              <span className="text-center">Stage</span>
              <span>Note</span>
              <span className="text-center">Waiting</span>
            </div>
            {data.map((task) => {
              const typeInfo = TASK_TYPE_ICONS[task.taskType];
              const TypeIcon = typeInfo?.icon ?? Sparkles;
              const durationColor = getDurationColor(task.waitingMs);
              return (
                <Link
                  key={task.id}
                  href={`/dashboard/projects/${task.project.id}/tasks/${task.id}`}
                  target="_blank"
                  className="grid grid-cols-[1fr_140px_110px_120px_1fr_80px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
                      <TypeIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">{task.title}</p>
                      <p className="text-[10px] text-muted-foreground/50">
                        <span className="font-mono">#{task.taskNumber}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    {task.assignee ? (
                      <>
                        {task.assignee.imageUrl ? (
                          <img src={task.assignee.imageUrl} alt={task.assignee.name ?? ""} className="w-5 h-5 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <span className="text-[9px] font-semibold text-muted-foreground">{(task.assignee.name ?? "?").charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="text-[11px] text-muted-foreground truncate">{task.assignee.name}</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/50">Unassigned</span>
                    )}
                  </div>

                  <span className="text-[11px] text-muted-foreground truncate">{task.project.name}</span>

                  <div className="flex justify-center">
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate", STAGE_COLORS[task.stage] ?? "bg-muted text-muted-foreground border-border")}>
                      {task.stageLabel}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground/60 truncate italic flex items-center gap-1">
                    {task.note ? (
                      <>
                        <StickyNote className="w-3 h-3 text-amber-400/60 shrink-0" />
                        {task.note}
                      </>
                    ) : "—"}
                  </p>

                  <div className="flex justify-center">
                    <span className={cn("text-[12px] font-mono font-bold tabular-nums flex items-center gap-1", durationColor)}>
                      <Clock className="w-3 h-3" />
                      {formatDuration(task.waitingMs)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
