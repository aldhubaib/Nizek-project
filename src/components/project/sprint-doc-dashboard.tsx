"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  MinusCircle,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { formatMinutes } from "@/components/project/sprint-task-row";
import { taskTypeStyle } from "@/lib/task-type-style";
import {
  countSprintTaskFieldGaps,
  emptySprintInfoFieldCount,
  sprintEndGaps,
  sprintStartGaps,
  summarizeSprintTasks,
  type SprintGaps,
  type SprintPlanningInfo,
} from "@/lib/sprint-planning-doc";
import { cn } from "@/lib/utils";

type DashTask = {
  taskType: string;
  estimatedMinutes?: number | null;
  stage?: string;
  assignee?: unknown;
  decision?: string;
  risk?: string;
};

function Tile({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: typeof Sparkles;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 px-3 py-3.5 text-center">
      <Icon className={cn("size-4 shrink-0", color)} strokeWidth={1.75} />
      <span className={cn("text-2xl font-bold tabular-nums leading-none", color)}>{value}</span>
      <span className="text-xs leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function TileRow({
  tiles,
  columns,
}: {
  tiles: { key: string; icon: typeof Sparkles; value: string; label: string; color: string }[];
  columns: 2 | 4 | 5;
}) {
  return (
    <div
      className={cn(
        "grid divide-x divide-y divide-border/60 sm:divide-y-0",
        columns === 2 && "grid-cols-2",
        columns === 4 && "grid-cols-2 sm:grid-cols-4",
        columns === 5 && "grid-cols-2 sm:grid-cols-5",
      )}
    >
      {tiles.map((tile) => (
        <Tile key={tile.key} icon={tile.icon} value={tile.value} label={tile.label} color={tile.color} />
      ))}
    </div>
  );
}

/**
 * Why Start/End is inactive. Compact sits next to the header button; the full
 * block lives in the document so the reason is visible without hovering a
 * disabled control.
 */
export function SprintMissingCounter({
  gaps,
  compact = false,
}: {
  gaps: SprintGaps;
  compact?: boolean;
}) {
  if (gaps.total <= 0 && !gaps.reason) return null;
  const label = gaps.total > 0 ? "Required fields missing" : gaps.reason;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        compact
          ? "max-w-[18rem] text-end"
          : "flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5",
      )}
    >
      {compact ? (
        <p className="flex items-center justify-end gap-1.5 text-xs font-semibold tabular-nums text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          {gaps.total > 0 ? `${gaps.total} missing` : label}
        </p>
      ) : (
        <>
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <p className="text-s font-semibold text-destructive">{label}</p>
        </>
      )}
    </div>
  );
}

export function SprintDocDashboard({
  tasks,
  review = false,
  added = 0,
  removed = 0,
  hideAssignees = false,
  activeSprintName = null,
  info = null,
  missingIncompleteReasons = 0,
}: {
  tasks: DashTask[];
  review?: boolean;
  /** How far the sprint has drifted from what the document committed to. */
  added?: number;
  removed?: number;
  /** Clients never see staff names, so a null assignee is not missing data. */
  hideAssignees?: boolean;
  /** A different sprint already running, which blocks Start. */
  activeSprintName?: string | null;
  info?: SprintPlanningInfo | null;
  missingIncompleteReasons?: number;
}) {
  const stats = summarizeSprintTasks(tasks);
  const taskGaps = countSprintTaskFieldGaps(tasks);
  const emptyInfoFields = emptySprintInfoFieldCount(info, { includeReviewDate: review });
  const planningGaps = sprintStartGaps({
    activeSprintName,
    emptyInfoFields: review ? 0 : emptyInfoFields,
    missingEstimates: review ? 0 : taskGaps.estimates,
    missingAssignees: review || hideAssignees ? 0 : taskGaps.assignees,
    missingDecisions: review ? 0 : taskGaps.decisions,
    missingRisks: review ? 0 : taskGaps.risks,
  });
  const endingGaps = sprintEndGaps({
    emptyInfoFields: review ? emptyInfoFields : 0,
    missingIncompleteReasons: review ? missingIncompleteReasons : 0,
  });
  const actionGaps = review ? endingGaps : planningGaps;
  const typeTiles = [
    {
      key: "bc",
      icon: taskTypeStyle("FEATURE").icon,
      value: String(stats.businessCases),
      label: "Business cases",
      color: taskTypeStyle("FEATURE").text,
    },
    {
      key: "en",
      icon: taskTypeStyle("ENHANCEMENT").icon,
      value: String(stats.enhancements),
      label: "Enhancements",
      color: taskTypeStyle("ENHANCEMENT").text,
    },
    {
      key: "bug",
      icon: taskTypeStyle("BUG").icon,
      value: String(stats.bugs),
      label: "Bugs",
      color: taskTypeStyle("BUG").text,
    },
    {
      key: "des",
      icon: taskTypeStyle("DESIGN").icon,
      value: String(stats.design),
      label: "Design",
      color: taskTypeStyle("DESIGN").text,
    },
    {
      key: "time",
      icon: Clock,
      value: stats.totalMinutes ? formatMinutes(stats.totalMinutes) : "—",
      label: "Total time",
      color: "text-success",
    },
  ];

  return (
    <div className="mb-12 mt-2 w-full">
      {actionGaps.total > 0 || actionGaps.reason ? (
        <div className="mb-6">
          <SprintMissingCounter gaps={actionGaps} />
        </div>
      ) : null}
      <div
        className="w-full overflow-hidden rounded-2xl border border-border/60 bg-card/50"
        aria-label="Sprint summary"
      >
        <TileRow tiles={typeTiles} columns={typeTiles.length > 4 ? 5 : 4} />
      {review ? (
        <div className="border-t border-border/60">
          <TileRow
            tiles={[
              {
                key: "done",
                icon: CheckCircle2,
                value: String(stats.completed),
                label: "Completed tasks",
                color: "text-success",
              },
              {
                key: "open",
                icon: Circle,
                value: String(stats.uncompleted),
                label: "Uncompleted tasks",
                color: "text-orange",
              },
              // The same counts the sections at the foot of the document list
              // out in full, said up here where the sprint is summarised.
              {
                key: "added",
                icon: PlusCircle,
                value: String(added),
                label: "Added to sprint",
                color: "text-success",
              },
              {
                key: "removed",
                icon: MinusCircle,
                value: String(removed),
                label: "Removed from sprint",
                color: "text-destructive",
              },
            ]}
            columns={4}
          />
        </div>
      ) : null}
      </div>
    </div>
  );
}
