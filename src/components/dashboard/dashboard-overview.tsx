"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Hourglass, X, Loader2, Crown, Users, ListTodo, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAwaitingDevelopment, getSupervisedProjects, getProjectStageDistribution } from "@/actions/dashboard";
import { ProjectStageChart } from "./project-stage-chart";
import { OverallStageBar } from "./overall-stage-bar";

type AwaitingData = NonNullable<Awaited<ReturnType<typeof getAwaitingDevelopment>>>;
type AwaitingTask = AwaitingData["tasks"][number];
type SupervisedProjects = Awaited<ReturnType<typeof getSupervisedProjects>>;
type StageDistribution = Awaited<ReturnType<typeof getProjectStageDistribution>>;

const STAGE_STYLE: Record<string, { label: string; text: string; dot: string }> = {
  CLARIFICATION: { label: "Clarification", text: "text-violet-400", dot: "bg-violet-400" },
};

function waitingLabel(enteredAt: Date | string | null): string {
  if (!enteredAt) return "";
  const ms = Date.now() - new Date(enteredAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Shared stat-card layout: title top-left, info button top-right, value in the
// middle, description bottom-left and the card's symbol icon bottom-right.
function StatCard({
  label,
  icon: Icon,
  description,
  disabled,
  onOpen,
  info,
  children,
}: {
  label: string;
  icon: typeof Hourglass;
  description: string;
  disabled?: boolean;
  onOpen: () => void;
  info: React.ReactNode;
  children: React.ReactNode;
}) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && onOpen()}
      onKeyDown={(e) => e.key === "Enter" && !disabled && onOpen()}
      className="app-card relative flex flex-col rounded-xl border border-border bg-card p-4 text-start transition-colors hover:border-muted-foreground/30 hover:bg-accent/20 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo((v) => !v);
          }}
          title="What is this?"
          className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
        >
          <Info className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-2 min-h-[32px]">{children}</div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-xs text-muted-foreground">{description}</p>
        <Icon className="w-4 h-4 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
      </div>

      {showInfo && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-10 z-20 w-72 rounded-lg border border-border bg-popover p-3 shadow-xl cursor-default"
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-foreground">About this card</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowInfo(false);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {info}
        </div>
      )}
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="app-card rounded-xl border border-dashed border-border/70 bg-card/40 p-4 flex flex-col">
      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
        Coming soon
      </span>
      <span className="mt-2 text-l font-bold leading-none text-muted-foreground/20">—</span>
    </div>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function DashboardOverview() {
  // undefined = loading; null = hidden (viewer is not a developer)
  const [data, setData] = useState<AwaitingData | null | undefined>(undefined);
  const [supervised, setSupervised] = useState<SupervisedProjects | null>(null);
  const [distribution, setDistribution] = useState<StageDistribution>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showSupervision, setShowSupervision] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const [awaiting, supervisedProjects, stageDistribution] = await Promise.all([
          getAwaitingDevelopment(),
          getSupervisedProjects(),
          getProjectStageDistribution(),
        ]);
        setData(awaiting);
        setSupervised(supervisedProjects);
        setDistribution(stageDistribution);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      }
    });
  }, []);

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, AwaitingTask[]>();
    for (const t of data.tasks) {
      const list = map.get(t.stage) ?? [];
      list.push(t);
      map.set(t.stage, list);
    }
    // Mine first within each stage
    for (const list of map.values()) {
      list.sort((a, b) => Number(b.mine) - Number(a.mine));
    }
    return ["CLARIFICATION"]
      .filter((s) => map.has(s))
      .map((s) => ({ stage: s, tasks: map.get(s)! }));
  }, [data]);

  return (
    <div className="lg:col-span-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Awaiting Development — developers only; others get a placeholder slot */}
        {data === null ? (
          <EmptySlot />
        ) : (
          <StatCard
            label="Awaiting Development"
            icon={Hourglass}
            description="Yours / all open before development"
            disabled={!data}
            onOpen={() => setShowDetails(true)}
            info={
              <>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  You are assigned to projects as a <strong className="text-foreground">Developer</strong> —
                  this card shows the work heading your way: every open task in{" "}
                  <strong className="text-foreground">Clarification</strong> on those projects.
                  Projects you supervise are not counted.
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  The first number is tasks assigned to you, the second is everything waiting.
                  Click the card for the full list.
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground/60">
                  Only users with the Developer role see this card.
                </p>
              </>
            }
          >
            {error ? (
              <span className="text-xs text-destructive">{error}</span>
            ) : data ? (
              <span className="text-l font-bold leading-none tabular-nums">
                {data.mine}
                <span className="text-muted-foreground/60 font-semibold"> / {data.total}</span>
              </span>
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
            )}
          </StatCard>
        )}

        {/* My Supervision */}
        <StatCard
          label="My Supervision"
          icon={Crown}
          description="Projects you lead as Team Lead"
          disabled={!supervised}
          onOpen={() => setShowSupervision(true)}
          info={
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                You hold a role with <strong className="text-foreground">Team Lead</strong> enabled
                on these projects, which lets you see all of their members&apos; tasks and late items
                on the dashboard.
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Click the card to list your projects with their open task and member counts.
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground/60">
                Shows 0 if none of your roles have Team Lead enabled.
              </p>
            </>
          }
        >
          {error ? (
            <span className="text-xs text-destructive">{error}</span>
          ) : supervised ? (
            <span className="text-l font-bold leading-none tabular-nums">
              {supervised.length}
              <span className="text-muted-foreground/60 font-semibold text-s"> project{supervised.length === 1 ? "" : "s"}</span>
            </span>
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
          )}
        </StatCard>

        {/* Empty slots */}
        <EmptySlot />
        <EmptySlot />
      </div>

      {/* Tasks by stage — developers, PMs and team leads */}
      {distribution && <ProjectStageChart data={distribution} />}

      {/* Overall pipeline — same audience, all projects combined */}
      {distribution && <OverallStageBar data={distribution} />}

      {/* Details popup */}
      {showDetails && data && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h2 className="text-m font-semibold">
                Awaiting development · {data.mine}
                <span className="text-muted-foreground font-medium"> / {data.total}</span>
              </h2>
              <button
                onClick={() => setShowDetails(false)}
                className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-5">
              {data.total === 0 && (
                <p className="py-8 text-center text-s text-muted-foreground">
                  No tasks are waiting to enter development.
                </p>
              )}

              {grouped.map(({ stage, tasks }) => {
                const style = STAGE_STYLE[stage];
                return (
                  <div key={stage}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("w-1.5 h-1.5 rounded-full", style?.dot ?? "bg-muted-foreground")} />
                      <span className={cn("text-xs font-semibold uppercase tracking-[0.15em]", style?.text ?? "text-muted-foreground")}>
                        {style?.label ?? stage}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">{tasks.length}</span>
                    </div>
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <Link
                          key={task.id}
                          href={`/dashboard/projects/${task.project.id}/tasks/${task.id}`}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-accent/30",
                            task.mine ? "border-primary/30 bg-primary/[0.03]" : "border-border bg-card",
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-s font-medium truncate">
                              {task.title}
                              {task.mine && (
                                <span className="ms-2 text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5 align-middle">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {task.project.name} · #{task.taskNumber}
                            </p>
                          </div>
                          {task.assignee && (
                            task.assignee.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={task.assignee.imageUrl}
                                alt={task.assignee.name ?? ""}
                                title={task.assignee.name ?? undefined}
                                className="w-7 h-7 rounded-full shrink-0 object-cover"
                              />
                            ) : (
                              <span
                                title={task.assignee.name ?? undefined}
                                className="w-7 h-7 rounded-full shrink-0 bg-primary/20 text-primary text-xs font-bold flex items-center justify-center"
                              >
                                {initials(task.assignee.name)}
                              </span>
                            )
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-8 text-end">
                            {waitingLabel(task.enteredAt)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Supervision popup */}
      {showSupervision && supervised && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={() => setShowSupervision(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h2 className="text-m font-semibold flex items-center gap-2">
                <Crown className="w-4 h-4 text-orange" strokeWidth={1.5} />
                My supervision · {supervised.length}
                <span className="text-muted-foreground font-medium">project{supervised.length === 1 ? "" : "s"}</span>
              </h2>
              <button
                onClick={() => setShowSupervision(false)}
                className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-2">
              {supervised.length === 0 && (
                <p className="py-8 text-center text-s text-muted-foreground">
                  You are not marked as Team Lead on any project yet.
                </p>
              )}
              {supervised.map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className="app-card flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/30"
                >
                  <span className="w-8 h-8 rounded-lg bg-orange/10 border border-orange/20 text-orange text-s font-bold flex items-center justify-center shrink-0">
                    {project.name.slice(0, 1).toUpperCase()}
                  </span>
                  <p className="flex-1 min-w-0 text-s font-medium truncate">{project.name}</p>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums shrink-0">
                    <ListTodo className="w-3 h-3" />
                    {project.openTasks} open
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums shrink-0">
                    <Users className="w-3 h-3" />
                    {project.memberCount}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
