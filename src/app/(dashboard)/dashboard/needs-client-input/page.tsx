import Link from "next/link";
import { ArrowLeft, UserCircle2, AlertTriangle, Clock, Sparkles, Zap, Bug, AlertCircle, Palette, StickyNote } from "lucide-react";
import { getTasksNeedingClientInput } from "@/actions/dashboard";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary bg-primary/10 border-primary/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-destructive bg-destructive/10 border-destructive/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const STAGE_COLORS: Record<string, string> = {
  NEW_REQUEST: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
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
  if (days >= 7) return "text-destructive";
  if (days >= 5) return "text-orange";
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
      <PageHeader className="justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center gap-xs text-muted-foreground hover:text-foreground transition-colors text-s"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <span className="text-border">|</span>
          <h1 className="text-s font-semibold flex items-center gap-2">
            <UserCircle2 className="w-4 h-4 text-muted-foreground" />
            {prefix} Needs Client Input
          </h1>
          <span className="text-xs text-muted-foreground">({data.length} tasks)</span>
        </div>
        {data.length > 0 && (
          <span className="flex items-center gap-1 text-xs font-bold text-orange bg-orange/10 border border-orange/20 rounded-full px-2.5 py-0.5">
            <AlertTriangle className="w-3 h-3" />
            {data.length} waiting
          </span>
        )}
      </PageHeader>

      <div className="px-app py-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UserCircle2 className="w-8 h-8 text-muted-foreground/20 mb-3" strokeWidth={1.5} />
            <p className="text-s text-muted-foreground">No tasks waiting on client input</p>
          </div>
        ) : (
          <div className="app-card rounded-xl border border-border bg-card divide-y divide-border">
            <div className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_140px_110px_120px_1fr_80px] gap-4 px-5 py-2.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
              <span>Task</span>
              <span className="@max-md/card:hidden">Assignee</span>
              <span className="@max-md/card:hidden">Project</span>
              <span className="text-center @max-md/card:hidden">Stage</span>
              <span className="@max-md/card:hidden">Note</span>
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
                  className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_140px_110px_120px_1fr_80px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
                      <TypeIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-s font-medium truncate group-hover:text-primary transition-colors">{task.title}</p>
                      <p className="text-xs text-muted-foreground/50">
                        <span className="font-mono">#{task.taskNumber}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 min-w-0 @max-md/card:hidden">
                    {task.assignee ? (
                      <>
                        {task.assignee.imageUrl ? (
                          <img src={task.assignee.imageUrl} alt={task.assignee.name ?? ""} className="w-5 h-5 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-muted-foreground">{(task.assignee.name ?? "?").charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground truncate">{task.assignee.name}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Unassigned</span>
                    )}
                  </div>

                  <span className="text-xs text-muted-foreground truncate @max-md/card:hidden">{task.project.name}</span>

                  <div className="flex justify-center @max-md/card:hidden">
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border truncate", STAGE_COLORS[task.stage] ?? "bg-muted text-muted-foreground border-border")}>
                      {task.stageLabel}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground/60 truncate italic flex items-center gap-1 @max-md/card:hidden">
                    {task.note ? (
                      <>
                        <StickyNote className="w-3 h-3 text-orange/60 shrink-0" />
                        {task.note}
                      </>
                    ) : "—"}
                  </p>

                  <div className="flex justify-center">
                    <span className={cn("text-s font-mono font-bold tabular-nums flex items-center gap-1", durationColor)}>
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
