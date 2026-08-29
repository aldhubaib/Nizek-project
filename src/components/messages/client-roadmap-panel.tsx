"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { listSprints, type SprintDTO } from "@/actions/sprint";
import {
  SPRINT_BOARD_COLUMNS,
  sprintBoardColumn,
  type SprintBoardColumn,
} from "@/lib/sprint-status";
import { cn } from "@/lib/utils";

const COLUMN_COLOR: Record<SprintBoardColumn, string> = {
  PLANNED: "bg-muted-foreground",
  NEXT: "bg-cyan",
  ACTIVE: "bg-sky",
  COMPLETED: "bg-orange",
  SHIPPED: "bg-success",
};

function formatRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const sameYear = start.getFullYear() === end.getFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}

/**
 * Read-only roadmap for the client chat. The project page's board puts the
 * five stages in columns; a slide-over is too narrow for that, so the same
 * grouping runs vertically here.
 */
export function ClientRoadmapPanel({ projectId }: { projectId: string }) {
  const [sprints, setSprints] = useState<SprintDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSprints(projectId)
      .then((rows) => {
        if (!cancelled) setSprints(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the roadmap.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return <p className="px-app py-6 text-s text-destructive">{error}</p>;
  }

  if (!sprints) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sprints.length === 0) {
    return (
      <p className="px-app py-6 text-s text-muted-foreground">
        Nothing on the roadmap yet.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[46rem] space-y-5 px-app py-4">
      {SPRINT_BOARD_COLUMNS.map((column) => {
        const rows = sprints.filter(
          (s) => sprintBoardColumn(s.status) === column.id,
        );
        if (rows.length === 0) return null;
        return (
          <section key={column.id}>
            <div className="flex items-center gap-2 px-1 pb-2">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  COLUMN_COLOR[column.id],
                )}
              />
              <h3 className="text-s font-medium">{column.label}</h3>
              <span className="text-s text-muted-foreground">
                {rows.length}
              </span>
            </div>
            <ul className="space-y-2">
              {rows.map((sprint) => (
                <li
                  key={sprint.id}
                  className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-s font-medium">
                      {sprint.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {sprint.taskCount === 1
                        ? "1 task"
                        : `${sprint.taskCount} tasks`}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatRange(sprint.startDate, sprint.endDate)}
                  </div>
                  {sprint.goal && (
                    <p className="mt-1.5 text-s text-muted-foreground">
                      {sprint.goal}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
