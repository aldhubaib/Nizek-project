import Link from "next/link";
import { ArrowLeft, Users, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { getLongestInStageByAssignee } from "@/actions/dashboard";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

const STAGE_FILTERS: Record<string, string[]> = {
  product: ["INTERNAL_REVIEW", "CLIENT_REVIEW"],
  dev: ["READY_FOR_DEV", "IN_DEVELOPMENT"],
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

export default async function PipelineAssigneePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const stages = tab ? STAGE_FILTERS[tab] : undefined;
  const data = await getLongestInStageByAssignee(stages);

  const backHref = tab ? `/dashboard?tab=${tab}` : "/dashboard";
  const totalLate = data.reduce((sum, d) => sum + d.lateCount, 0);

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
            <Users className="w-4 h-4 text-muted-foreground" />
            {tab === "product" ? "PM" : tab === "dev" ? "Dev" : ""} Longest in Stage By Assignee
          </h1>
          <span className="text-xs text-muted-foreground">({data.length} people)</span>
        </div>
        {totalLate > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-orange bg-orange/10 border border-orange/20 rounded-full px-2.5 py-0.5">
            <AlertTriangle className="w-3 h-3" />
            {totalLate} late tasks
          </span>
        )}
      </PageHeader>

      <div className="px-app py-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-8 h-8 text-muted-foreground/20 mb-3" strokeWidth={1.5} />
            <p className="text-s text-muted-foreground">No one has stalled tasks</p>
          </div>
        ) : (
          <div className="app-card rounded-xl border border-border bg-card divide-y divide-border">
            <div className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_100px_100px_24px] gap-4 px-5 py-2.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
              <span>Assignee</span>
              <span className="text-center @max-md/card:hidden">Late Tasks</span>
              <span className="text-center">Longest</span>
              <span className="@max-md/card:hidden" />
            </div>
            {data.map((item) => (
              <Link
                key={item.assignee.id}
                href={`/dashboard/pipeline-assignee/${item.assignee.id}${tab ? `?tab=${tab}` : ""}`}
                className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_100px_100px_24px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.assignee.imageUrl ? (
                    <img
                      src={item.assignee.imageUrl}
                      alt={item.assignee.name ?? ""}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {(item.assignee.name ?? "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <p className="text-s font-medium truncate group-hover:text-primary transition-colors">{item.assignee.name ?? "Unassigned"}</p>
                </div>

                <div className="flex justify-center @max-md/card:hidden">
                  <span className="text-s font-bold tabular-nums">{item.lateCount}</span>
                </div>

                <div className="flex justify-center">
                  <span className={cn("text-s font-mono font-bold tabular-nums flex items-center gap-1", getDurationColor(item.longestMs))}>
                    <Clock className="w-3 h-3" />
                    {formatDuration(item.longestMs)}
                  </span>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors @max-md/card:hidden" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
