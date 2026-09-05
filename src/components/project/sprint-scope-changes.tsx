"use client";

import { MinusCircle } from "lucide-react";
import { EstimateBadge, SprintTaskRow } from "@/components/project/sprint-task-row";
import { REMOVED_BLURB, REMOVED_HEADING, type SprintRemovedTask } from "@/lib/sprint-doc";

/**
 * What has left the sprint since it started.
 *
 * Shown beside the document rather than inside it, and only while the sprint is
 * running. Nothing here is typed into the page — the reasons were given in the
 * dialog that moved the work — and the list changes with every drag, so there
 * is nothing to preserve until it stops moving. When the sprint closes,
 * completeSprint writes the final version into the document itself, and this
 * panel is no longer drawn.
 *
 * Work added after the start is not here: it is in the sprint, so it belongs in
 * the outcome with the rest of the sprint's tasks, under its own heading.
 */
export function SprintRemovedPanel({
  removed,
  hideAssignees = false,
}: {
  removed: SprintRemovedTask[];
  hideAssignees?: boolean;
}) {
  if (removed.length === 0) return null;

  return (
    <section className="mt-16 border-t border-border pt-10">
      <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <MinusCircle className="size-5 shrink-0 text-destructive" strokeWidth={2} />
        {REMOVED_HEADING}
        <span className="text-lg font-semibold tabular-nums text-muted-foreground">
          {removed.length}
        </span>
      </h2>
      <p className="mt-3 text-s leading-relaxed text-muted-foreground">{REMOVED_BLURB}</p>

      <div className="mt-5 space-y-3">
        {removed.map((entry) => (
          <SprintTaskRow
            key={entry.task.id}
            as="div"
            task={entry.task}
            missingData={false}
            hidePriority
            hideAssignee={hideAssignees}
            disableHoverBorder
            extra={
              entry.task.estimatedMinutes ? (
                <EstimateBadge minutes={entry.task.estimatedMinutes} />
              ) : undefined
            }
            footer={
              entry.reason || entry.movedTo ? (
                <div className="space-y-1 border-t border-border/60 pt-3 text-s leading-relaxed text-muted-foreground">
                  {entry.reason ? (
                    <p>
                      <span className="font-semibold text-foreground">Reason for removing:</span>{" "}
                      {entry.reason}
                    </p>
                  ) : null}
                  {entry.movedTo ? (
                    <p>
                      Moved to <span className="font-medium text-foreground">{entry.movedTo}</span>.
                    </p>
                  ) : null}
                </div>
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
