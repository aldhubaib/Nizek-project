import Link from "next/link";
import { ArrowLeft, Clock, Sparkles, Zap, Bug, AlertCircle, Palette, StickyNote } from "lucide-react";
import { getClientDependencies } from "@/actions/dashboard";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary bg-primary/10 border-primary/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-destructive bg-destructive/10 border-destructive/20", label: "Bug" },
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
            <Clock className="w-4 h-4 text-muted-foreground" />
            {prefix} Waiting on Client
          </h1>
          <span className="text-xs text-muted-foreground">
            ({totalTasks} tasks across {data.length} projects)
          </span>
        </div>
        {totalTasks > 0 && (
          <span className="flex items-center gap-1 text-xs font-bold text-orange bg-orange/10 border border-orange/20 rounded-full px-2.5 py-0.5">
            {totalTasks} pending
          </span>
        )}
      </PageHeader>

      <div className="px-app py-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/20 mb-3" strokeWidth={1.5} />
            <p className="text-s text-muted-foreground">Nothing waiting on client</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((group) => (
              <div key={group.project.id} className="app-card rounded-xl border border-border bg-card divide-y divide-border">
                <div className="px-5 py-3 flex items-center justify-between">
                  <h3 className="text-s font-semibold">{group.project.name}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_100px_110px_1fr] gap-3 px-5 py-2.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  <span>Task</span>
                  <span className="@max-md/card:hidden">Stage</span>
                  <span>Assignee</span>
                  <span className="@max-md/card:hidden">Note</span>
                </div>
                {group.tasks.map((item) => {
                  const typeInfo = TASK_TYPE_ICONS[item.task.taskType];
                  const TypeIcon = typeInfo?.icon ?? Sparkles;
                  return (
                    <Link
                      key={item.task.id}
                      href={`/dashboard/projects/${item.task.project.id}/tasks/${item.task.id}`}
                      target="_blank"
                      className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_100px_110px_1fr] gap-3 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
                          <TypeIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-s font-medium truncate group-hover:text-primary transition-colors">{item.task.title}</p>
                          <p className="text-xs text-muted-foreground/50">
                            <span className="font-mono">#{item.task.taskNumber}</span>
                            <span className="mx-1">·</span>
                            {item.task.project.name}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground truncate @max-md/card:hidden">{STAGE_LABELS[item.task.stage] ?? item.task.stage}</span>
                      <span className="text-xs text-muted-foreground truncate">{item.task.assignee?.name ?? "Unassigned"}</span>
                      <p className="text-xs text-muted-foreground/60 truncate italic flex items-center gap-1 @max-md/card:hidden">
                        {item.note ? (
                          <>
                            <StickyNote className="w-3 h-3 text-orange/60 shrink-0" />
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
