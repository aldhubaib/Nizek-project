"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowLeft, CalendarClock, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { NoteImage } from "@/components/tiptap/note-image";
import { TextDirection } from "@/components/tiptap/text-direction";
import { AttendanceBlock } from "@/components/tiptap/attendance-block";
import { SprintInfoBlock } from "@/components/tiptap/sprint-info-block";
import { SprintTaskBlock } from "@/components/tiptap/sprint-task-block";
import { OverflowTabBar } from "@/components/overflow-tab-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { NOTE_TYPE_CONFIG, type NoteType } from "@/components/project/note-types";
import { getTypeIcon, SprintTaskRow } from "@/components/project/sprint-task-row";
import {
  SPRINT_BOARD_COLUMNS,
  sprintBoardColumn,
  type SprintBoardColumn,
} from "@/lib/sprint-status";
import { cn } from "@/lib/utils";
import {
  getClientProjectOverview,
  getClientSprintDoc,
  type ClientProjectOverview,
  type ClientSprintDocRef,
  type ClientSprintEntry,
} from "@/actions/client-project";

type PanelTab = "dashboard" | "sprints" | "completed" | "backlog";

/** Work in flight, in progress first — the Sprints tab opens on that group. */
const OPEN_COLUMNS: SprintBoardColumn[] = ["ACTIVE", "NEXT", "PLANNED"];

/** Finished work, kept on its own tab so history never buries current work. */
const CLOSED_COLUMNS: SprintBoardColumn[] = ["COMPLETED", "SHIPPED"];

const COLUMN_LABEL = Object.fromEntries(
  SPRINT_BOARD_COLUMNS.map((c) => [c.id, c.label]),
) as Record<SprintBoardColumn, string>;

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const RING_C = 88;

function daysLeft(iso: string, nowMs: number): number {
  return Math.ceil((new Date(iso).getTime() - nowMs) / (1000 * 60 * 60 * 24));
}

function daysLeftLabel(iso: string, nowMs: number): string {
  const d = daysLeft(iso, nowMs);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Tomorrow";
  return `${d}d`;
}

function daysLeftColor(iso: string, nowMs: number): string {
  const d = daysLeft(iso, nowMs);
  if (d < 0) return "text-destructive";
  if (d <= 7) return "text-orange";
  return "text-success";
}

function sprintProgress(startIso: string, endIso: string, nowMs: number): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (nowMs <= start) return 0;
  if (nowMs >= end) return 100;
  return Math.round(((nowMs - start) / (end - start)) * 100);
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-5", className)}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-s font-semibold text-foreground">{children}</h2>;
}

/** Client-facing slices — internal review is folded into Review, not named as such. */
const STAGE_RING = [
  { key: "READY_FOR_DEV", label: "Todo", color: "#22d3ee" },
  { key: "IN_DEVELOPMENT", label: "In Dev", color: "#38bdf8" },
  { key: "INTERNAL_REVIEW", label: "Review", color: "#f97316" },
  { key: "CLIENT_REVIEW", label: "Waiting on you", color: "#fb923c" },
  { key: "READY_FOR_RELEASE", label: "Ready", color: "#34d399" },
  { key: "DONE", label: "Delivered", color: "#4ade80" },
] as const;

const TYPE_RING = [
  { key: "FEATURE", label: "Business cases", color: "#38bdf8" },
  { key: "ENHANCEMENT", label: "Enhancements", color: "#a78bfa" },
  { key: "BUG", label: "Bugs", color: "#ef4444" },
  { key: "REPORTED_BUG", label: "Reported bugs", color: "#ef4444" },
  { key: "DESIGN", label: "Design", color: "#22d3ee" },
] as const;

function DonutChart({
  breakdown,
  total,
  slices,
}: {
  breakdown: Record<string, number>;
  total: number;
  slices: readonly { key: string; label: string; color: string }[];
}) {
  const R = 40;
  const STROKE = 10;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const counts = slices.map((slice) => ({
    ...slice,
    count: breakdown[slice.key] ?? 0,
  }));
  const visible = counts.filter((s) => s.count > 0);
  const arcs = visible.map((slice) => {
    const dash = (slice.count / total) * C;
    const arc = { ...slice, dash, gap: C - dash, offset };
    offset += dash;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width={100} height={100} viewBox="0 0 100 100" className="-rotate-90">
          <circle
            cx={50}
            cy={50}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-border"
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          ))}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-foreground">{total}</span>
          <span className="text-xs text-muted-foreground">tasks</span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((slice) => (
          <div key={slice.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="text-xs text-muted-foreground">{slice.label}</span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {slice.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeStackBars({
  groups,
}: {
  groups: {
    key: string;
    label: string;
    color: string;
    done: number;
    tasks: { id: string }[];
  }[];
}) {
  const maxTotal = Math.max(...groups.map((g) => g.tasks.length), 1);
  const maxH = 140;

  return (
    <Card>
      <CardTitle>By type</CardTitle>
      <div className="flex items-end justify-around gap-3 px-2">
        {groups.map((group) => {
          const total = group.tasks.length;
          const remaining = Math.max(0, total - group.done);
          const height = Math.max(28, Math.round((total / maxTotal) * maxH));
          const { icon: Icon, color } = getTypeIcon(group.key);
          return (
            <div
              key={group.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              title={`${group.label}: ${group.done} completed of ${total}`}
            >
              <div
                className="flex w-10 flex-col overflow-hidden rounded-full bg-border/60"
                style={{ height }}
              >
                {remaining > 0 && (
                  <div
                    className="w-full"
                    style={{ flex: remaining, background: group.color, opacity: 0.35 }}
                  />
                )}
                {group.done > 0 && (
                  <div
                    className="w-full"
                    style={{ flex: group.done, background: group.color }}
                  />
                )}
              </div>
              <Icon className={cn("size-4 shrink-0", color)} />
              <span className="text-xs tabular-nums text-muted-foreground">
                {total}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Solid is completed · faded is remaining
      </p>
    </Card>
  );
}

function SprintRingCard({
  name,
  startDate,
  endDate,
  taskCount,
  nowMs,
}: {
  name: string;
  startDate: string;
  endDate: string;
  taskCount: number;
  nowMs: number;
}) {
  const pct = sprintProgress(startDate, endDate, nowMs);
  const left = daysLeft(endDate, nowMs);
  const urgent = left <= 2;
  const dash = ((pct / 100) * RING_C).toFixed(2);
  const gap = (RING_C - (pct / 100) * RING_C).toFixed(2);

  return (
    <div className="flex w-full min-w-0 flex-col justify-between rounded-xl border border-border/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-s font-semibold text-foreground">{name}</span>
        <span className={cn("shrink-0 text-xs font-semibold tabular-nums", daysLeftColor(endDate, nowMs))}>
          {daysLeftLabel(endDate, nowMs)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <svg width={36} height={36} viewBox="0 0 36 36" className="-rotate-90 shrink-0">
          <circle cx={18} cy={18} r={14} fill="none" stroke="currentColor" strokeWidth={3} className="text-border" />
          <circle
            cx={18}
            cy={18}
            r={14}
            fill="none"
            stroke={urgent ? "#f97316" : "#22c55e"}
            strokeWidth={3}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{taskCount}</span> tasks
        </div>
      </div>
    </div>
  );
}

/**
 * The client's own view of their project, opened from the chat's 3-dot menu.
 * Everything here is read-only: clients have no project page to visit, so this
 * is where progress, the sprint documents and the backlog are visible to them.
 */
export function ClientProjectPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ClientProjectOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>("dashboard");
  const [openDoc, setOpenDoc] = useState<ClientSprintDocRef | null>(null);

  useEffect(() => {
    let cancelled = false;
    getClientProjectOverview(projectId)
      .then((row) => {
        if (!cancelled) setData(row);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your project.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return <p className="px-app py-6 text-s text-destructive">{error}</p>;
  }

  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (openDoc) {
    return (
      <div className="mx-auto w-full max-w-[52rem] px-app py-4">
        <button
          type="button"
          onClick={() => setOpenDoc(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-s text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h2 className="text-xl font-bold">{openDoc.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDay(openDoc.date)}
        </p>
        <div className="mt-4">
          <SprintDoc noteId={openDoc.id} projectId={projectId} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-app py-4">
      <OverflowTabBar
        items={[
          { id: "dashboard", label: "Dashboard" },
          { id: "sprints", label: "Sprints" },
          { id: "completed", label: "Completed" },
          { id: "backlog", label: "Backlog", count: data.backlog.length },
        ]}
        value={tab}
        onChange={setTab}
        justify="start"
        className="pb-4"
      />

      {tab === "dashboard" && <DashboardTab data={data} onOpenTab={setTab} />}
      {tab === "sprints" && (
        <SprintsTab
          sprints={data.sprints}
          columns={OPEN_COLUMNS}
          emptyLabel="No sprint documents yet."
          onOpen={setOpenDoc}
        />
      )}
      {tab === "completed" && (
        <SprintsTab
          sprints={data.sprints}
          columns={CLOSED_COLUMNS}
          emptyLabel="No completed sprints yet."
          onOpen={setOpenDoc}
        />
      )}
      {tab === "backlog" && <BacklogTab backlog={data.backlog} />}
    </div>
  );
}

function DashboardTab({
  data,
  onOpenTab,
}: {
  data: ClientProjectOverview;
  onOpenTab: (tab: PanelTab) => void;
}) {
  const nowMs = Date.now();
  const donutTotal = STAGE_RING.reduce(
    (n, slice) => n + (data.stageBreakdown[slice.key] ?? 0),
    0,
  );
  const typeGroups = TYPE_RING.map((slice) => {
    const tasks = data.typedTasks.filter((t) => t.taskType === slice.key);
    return {
      ...slice,
      tasks,
      done: tasks.filter((t) => t.stage === "DONE").length,
    };
  }).filter((g) => g.tasks.length > 0);
  const openTypeGroups = TYPE_RING.map((slice) => ({
    ...slice,
    tasks: data.backlog.filter((t) => t.taskType === slice.key),
  })).filter((g) => g.tasks.length > 0);

  return (
    <div>
      {typeGroups.length > 0 && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {typeGroups.map((group) => {
              const { icon: Icon, color } = getTypeIcon(group.key);
              return (
                <div
                  key={group.key}
                  className="rounded-2xl border border-border/60 bg-card p-4"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn("size-4 shrink-0", color)} />
                    <span className="truncate text-xs text-muted-foreground">
                      {group.label}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
                    {group.done}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    completed
                    {group.tasks.length > 0 ? ` of ${group.tasks.length}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mb-6">
            <TypeStackBars groups={typeGroups} />
          </div>
        </>
      )}

      <div className="mb-6 space-y-4">
        <Card>
          <CardTitle>Task Breakdown</CardTitle>
          {donutTotal > 0 ? (
            <DonutChart
              breakdown={data.stageBreakdown}
              total={donutTotal}
              slices={STAGE_RING}
            />
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No tasks yet
            </p>
          )}
        </Card>

        <Card>
          <CardTitle>Current sprint</CardTitle>
          {data.activeSprint || data.nextSprint ? (
            <div className="grid gap-3">
              {data.activeSprint && (
                <SprintRingCard
                  name={data.activeSprint.name}
                  startDate={data.activeSprint.startDate}
                  endDate={data.activeSprint.endDate}
                  taskCount={data.activeSprint.total}
                  nowMs={nowMs}
                />
              )}
              {data.nextSprint && (
                <SprintRingCard
                  name={data.nextSprint.name}
                  startDate={data.nextSprint.startDate}
                  endDate={data.nextSprint.endDate}
                  taskCount={data.nextSprint.taskCount}
                  nowMs={nowMs}
                />
              )}
              {data.activeSprint?.goal && (
                <p className="text-s text-muted-foreground">{data.activeSprint.goal}</p>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No sprint is running right now.
            </p>
          )}
        </Card>
      </div>

      {openTypeGroups.length === 0 ? (
        <div className="mb-6">
          <Card>
            <CardTitle>Tasks by type</CardTitle>
            <p className="py-6 text-center text-xs text-muted-foreground">
              No open tasks outside a sprint
            </p>
          </Card>
        </div>
      ) : (
        <div className="mb-6 space-y-4">
          {openTypeGroups.map((group) => {
            const { icon: Icon, color } = getTypeIcon(group.key);
            return (
              <Card key={group.key}>
                <div className="mb-4 flex items-center gap-2">
                  <Icon className={cn("size-4 shrink-0", color)} />
                  <h2 className="text-s font-semibold text-foreground">
                    {group.label}
                  </h2>
                </div>
                <div className="space-y-2">
                  {group.tasks.map((task) => (
                    <SprintTaskRow
                      key={task.id}
                      as="div"
                      hideAssignee
                      disableHoverBorder
                      task={{
                        title: task.title,
                        taskType: task.taskType,
                        stage: "BACKLOG",
                      }}
                    />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-s font-semibold text-foreground">
              {data.activeSprint ? "Sprint tasks" : "In progress"}
            </h2>
            {data.activeSprint && (
              <button
                type="button"
                onClick={() => onOpenTab("sprints")}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Documents
              </button>
            )}
          </div>
          {data.sprintTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className="mb-2 size-8 text-success/40" />
              <p className="text-s font-medium text-muted-foreground">
                Nothing in progress right now
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.sprintTasks.map((task) => (
                <SprintTaskRow
                  key={task.id}
                  as="div"
                  hideAssignee
                  disableHoverBorder
                  task={task}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          {data.deadlines.length > 0 && (
            <Card>
              <CardTitle>Upcoming Deadlines</CardTitle>
              <div className="space-y-1">
                {data.deadlines.map((dl) => (
                  <div
                    key={dl.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2"
                  >
                    <CalendarClock className="size-4 shrink-0 text-orange" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-s text-foreground">{dl.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDay(dl.dueDate)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        daysLeftColor(dl.dueDate, nowMs),
                      )}
                    >
                      {daysLeftLabel(dl.dueDate, nowMs)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-s font-semibold text-foreground">Backlog</h2>
              <button
                type="button"
                onClick={() => onOpenTab("backlog")}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                All
              </button>
            </div>
            {data.backlog.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nothing waiting in the backlog.
              </p>
            ) : (
              <div className="space-y-2">
                {data.backlog.slice(0, 5).map((task) => (
                  <SprintTaskRow
                    key={task.id}
                    as="div"
                    hideAssignee
                    disableHoverBorder
                    task={{
                      title: task.title,
                      taskType: task.taskType,
                      stage: "BACKLOG",
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Sprint documents as cards, the way the project's Notes tab shows them, split
 * by the roadmap's own grouping so the client starts on the sprint in progress
 * and can step across to what's planned or already finished.
 */
function SprintsTab({
  sprints,
  columns,
  emptyLabel,
  onOpen,
}: {
  sprints: ClientSprintEntry[];
  columns: SprintBoardColumn[];
  emptyLabel: string;
  onOpen: (doc: ClientSprintDocRef) => void;
}) {
  const groups = useMemo(() => {
    const documented = sprints.filter((s) => s.docs.length > 0);
    return columns
      .map((column) => ({
        column,
        sprints: documented.filter(
          (s) => sprintBoardColumn(s.status) === column,
        ),
      }))
      .filter((g) => g.sprints.length > 0);
  }, [sprints, columns]);

  const [column, setColumn] = useState<SprintBoardColumn | null>(null);
  const current = groups.find((g) => g.column === column) ?? groups[0] ?? null;

  if (!current) {
    return <p className="px-1 text-s text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div>
      {groups.length > 1 && (
        <OverflowTabBar
          items={groups.map((g) => ({
            id: g.column,
            label: COLUMN_LABEL[g.column],
            count: g.sprints.reduce((n, s) => n + s.docs.length, 0),
          }))}
          value={current.column}
          onChange={setColumn}
          justify="start"
          className="pb-4"
        />
      )}

      <div className="grid grid-cols-2 gap-s sm:[grid-template-columns:repeat(auto-fill,minmax(15.75rem,1fr))]">
        {current.sprints.flatMap((sprint) =>
          sprint.docs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              sprint={sprint}
              onOpen={() => onOpen(doc)}
            />
          )),
        )}
      </div>
    </div>
  );
}

function DocCard({
  doc,
  sprint,
  onOpen,
}: {
  doc: ClientSprintDocRef;
  sprint: ClientSprintEntry;
  onOpen: () => void;
}) {
  const cfg = NOTE_TYPE_CONFIG[doc.kind as NoteType];
  const Icon = cfg?.icon ?? FileText;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-3 text-start transition-colors hover:border-border"
    >
      {cfg && <StatusBadge config={cfg} icon={Icon} className="w-fit" />}

      <h3 className="mt-2.5 line-clamp-4 text-s font-bold leading-snug">
        {doc.title}
      </h3>

      {doc.preview ? (
        <div className="relative mt-2 min-h-0 flex-1 overflow-hidden">
          <p className="text-s leading-relaxed text-muted-foreground">
            {doc.preview}
          </p>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
        </div>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div className="mt-auto shrink-0 pt-3">
        <p className="truncate text-xs text-muted-foreground">{sprint.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          {formatDay(doc.date)}
        </p>
      </div>
    </div>
  );
}

function BacklogTab({
  backlog,
}: {
  backlog: ClientProjectOverview["backlog"];
}) {
  if (backlog.length === 0) {
    return (
      <p className="px-1 text-s text-muted-foreground">
        Nothing waiting in the backlog.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {backlog.map((task) => (
        <li key={task.id}>
          <SprintTaskRow
            as="div"
            hideAssignee
            disableHoverBorder
            task={{
              title: task.title,
              taskType: task.taskType,
              stage: "BACKLOG",
            }}
          />
        </li>
      ))}
    </ul>
  );
}

/** One sprint document, rendered read-only with the blocks staff wrote in it. */
function SprintDoc({
  noteId,
  projectId,
}: {
  noteId: string;
  projectId: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    getClientSprintDoc(noteId)
      .then((row) => {
        if (!cancelled) setHtml(row.content);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't open this document.");
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        NoteImage.configure({ inline: false }),
        TextDirection,
        AttendanceBlock,
        SprintInfoBlock,
        SprintTaskBlock.configure({ projectId }),
      ],
      content: html ?? "",
      editorProps: {
        attributes: {
          class: cn(
            "focus:outline-none prose prose-invert max-w-none text-m leading-relaxed",
            "prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base",
            "prose-img:rounded-lg prose-img:max-w-full",
          ),
        },
      },
    },
    [html, projectId],
  );

  if (error) return <p className="text-s text-destructive">{error}</p>;

  if (html === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <EditorContent editor={editor} />;
}
