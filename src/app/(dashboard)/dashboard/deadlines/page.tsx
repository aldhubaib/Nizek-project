import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CalendarClock, AlertTriangle } from "lucide-react";
import { getIncompleteDeadlines } from "@/actions/deadline-reminder";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

function statusFor(daysUntil: number) {
  if (daysUntil < 0) {
    return {
      label: `${Math.abs(daysUntil)}d overdue`,
      color: "text-destructive",
      bg: "bg-destructive/10 border-destructive/20",
    };
  }
  if (daysUntil === 0) {
    return {
      label: "Due today",
      color: "text-orange",
      bg: "bg-orange/10 border-orange/20",
    };
  }
  if (daysUntil <= 10) {
    return {
      label: `${daysUntil}d left`,
      color: "text-orange",
      bg: "bg-orange/10 border-orange/20",
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
      <PageHeader className="justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-xs text-s text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <span className="text-border">|</span>
          <h1 className="flex items-center gap-2 text-s font-semibold">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Incomplete Roadmap
          </h1>
          <span className="text-xs text-muted-foreground">({data.length})</span>
        </div>
        {overdueCount > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-3 w-3" />
            {overdueCount} overdue
          </span>
        )}
      </PageHeader>

      <div className="px-app py-6">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarClock className="mb-2 h-8 w-8 text-muted-foreground/20" />
            <p className="text-s text-muted-foreground">Nothing on the roadmap</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="divide-y divide-border/50">
              {data.map((item) => {
                const status = statusFor(item.daysUntil);
                return (
                  <Link
                    key={item.id}
                    href={`/dashboard/projects/${item.project.id}?tab=roadmap`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/20"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-s font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.project.name} · due {format(item.dueDate, "MMM d, yyyy")}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
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
