import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CalendarClock, AlertTriangle } from "lucide-react";
import { getIncompleteDeadlines } from "@/actions/deadline-reminder";
import { cn } from "@/lib/utils";

function statusFor(daysUntil: number) {
  if (daysUntil < 0) {
    return {
      label: `${Math.abs(daysUntil)}d overdue`,
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500/20",
    };
  }
  if (daysUntil === 0) {
    return {
      label: "Due today",
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    };
  }
  if (daysUntil <= 10) {
    return {
      label: `${daysUntil}d left`,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    };
  }
  return {
    label: `${daysUntil}d left`,
    color: "text-muted-foreground",
    bg: "bg-muted border-border",
  };
}

export default async function DeadlinesPage() {
  const data = await getIncompleteDeadlines();
  const overdueCount = data.filter((d) => d.daysUntil < 0).length;

  return (
    <div>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6 pr-14">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <span className="text-border">|</span>
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Incomplete Deadlines
          </h1>
          <span className="text-[11px] text-muted-foreground">({data.length})</span>
        </div>
        {overdueCount > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-400">
            <AlertTriangle className="h-3 w-3" />
            {overdueCount} overdue
          </span>
        )}
      </div>

      <div className="p-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarClock className="mb-2 h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No open deadlines</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="divide-y divide-border/50">
              {data.map((item) => {
                const status = statusFor(item.daysUntil);
                return (
                  <Link
                    key={item.id}
                    href={`/dashboard/projects/${item.project.id}?tab=notes`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/20"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{item.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.project.name} · due {format(item.dueDate, "MMM d, yyyy")}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                        status.bg,
                        status.color,
                      )}
                    >
                      {status.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
