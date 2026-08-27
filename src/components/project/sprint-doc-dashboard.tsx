"use client";

import { Bug, CheckCircle2, Circle, Clock, Palette, Sparkles, Wrench } from "lucide-react";
import { formatMinutes } from "@/components/project/sprint-task-row";
import { summarizeSprintTasks } from "@/lib/sprint-planning-doc";
import { cn } from "@/lib/utils";

type DashTask = { taskType: string; estimatedMinutes?: number | null; stage?: string };

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

export function SprintDocDashboard({
  tasks,
  review = false,
}: {
  tasks: DashTask[];
  review?: boolean;
}) {
  const stats = summarizeSprintTasks(tasks);
  const typeTiles = [
    {
      key: "bc",
      icon: Sparkles,
      value: String(stats.businessCases),
      label: "Business cases",
      color: "text-primary",
    },
    {
      key: "en",
      icon: Wrench,
      value: String(stats.enhancements),
      label: "Enhancements",
      color: "text-violet",
    },
    {
      key: "bug",
      icon: Bug,
      value: String(stats.bugs),
      label: "Bugs",
      color: "text-destructive",
    },
    ...(stats.design > 0
      ? [
          {
            key: "des",
            icon: Palette,
            value: String(stats.design),
            label: "Design",
            color: "text-cyan",
          },
        ]
      : []),
    {
      key: "time",
      icon: Clock,
      value: stats.totalMinutes ? formatMinutes(stats.totalMinutes) : "—",
      label: "Total time",
      color: "text-success",
    },
  ];

  return (
    <div
      className="mb-12 mt-2 w-full overflow-hidden rounded-2xl border border-border/60 bg-card/50"
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
            ]}
            columns={2}
          />
        </div>
      ) : null}
    </div>
  );
}
