"use client";

import { format } from "date-fns";
import { CheckCircle2, Clock, IterationCcw, ListChecks, Paperclip, StickyNote } from "lucide-react";

import { priorityLabel, taskCode, taskTypeLabel } from "@/lib/task-label";
import { computeIsReadyForTransition, isMissingDataTask } from "@/lib/task-readiness";
import { Chip, DetailSection, Fact, HeaderCard, HeaderCardSkeleton, RecordRow, type HeaderStat } from "@/next-ui/blocks";
import { useTask, type TaskPanel } from "@/next-ui/data/tasks";
import { SafeHtml } from "@/next-ui/lib/safe-html";
import { childId, hrefFromEntry, splitChildId, usePane } from "@/next-ui/panes";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { PageHeader } from "@/next-ui/patterns/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { Button } from "@/next-ui/ui/button";
import { Skeleton } from "@/next-ui/ui/skeleton";

import { formatMinutes, sprintDates } from "./board-state";
import { noteTypeLabel, NoteTypeIcon } from "./note-marks";
import { parseAnswer, type Answer } from "./task-answers";
import { PriorityMark, SprintStatusMark, StageMark, taskTypeMark, TaskTypeIcon } from "./task-marks";

/**
 * One task, read-only: what it is (key, type, stage, priority, who has it), its description,
 * the answers to its questions, the sprints it has been in and the notes about it. Editing,
 * moving, comments and proof of work are not built here yet.
 */
export function TaskScreen({ id }: { id: string }) {
  const ids = splitChildId(id);
  const projectId = ids?.parent ?? "";
  const taskId = ids?.child ?? "";
  const panel = useTask(taskId);
  const pane = usePane();

  if (panel.isPending) {
    return (
      <>
        <PageHeader title="Task" />
        <div className="flex flex-col gap-6" aria-busy>
          <HeaderCardSkeleton />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      </>
    );
  }
  if (panel.error || !panel.data) {
    return (
      <>
        <PageHeader title="Task" />
        <EmptyState
          icon={ListChecks}
          title="Could not open this task"
          description={panel.error instanceof Error ? panel.error.message : "It may have been deleted."}
          action={
            <Button variant="outline" onClick={pane.back}>
              Back
            </Button>
          }
        />
      </>
    );
  }

  const { task: t, questions, initialAnswers, initialNotes, projectName } = panel.data;
  const code = taskCode(t.taskType, t.taskNumber);
  const missing = isMissingDataTask({ stage: t.stage, isReadyForTransition: isReady(panel.data) });
  const mine = questions.filter((q) => q.taskType === t.taskType);
  const answers = mine.map((q) => ({ q, a: parseAnswer(q, initialAnswers[q.id]) }));
  const answered = answers.filter((x) => x.a.kind !== "empty").length;
  const current = t.sprints[0];
  const stats: HeaderStat[] = [
    { icon: Clock, value: t.estimatedMinutes ? formatMinutes(t.estimatedMinutes) : null, label: "estimate" },
    { icon: IterationCcw, value: t.sprints.length || null, label: t.sprints.length === 1 ? "sprint" : "sprints" },
    { icon: StickyNote, value: initialNotes.length || null, label: initialNotes.length === 1 ? "note" : "notes" },
  ];
  const type = taskTypeMark(t.taskType);
  const TypeIcon = type.icon;

  return (
    <>
      <PageHeader title={`${code} · ${t.title}`} />

      <div className="flex flex-col gap-6">
        <HeaderCard
          avatar={
            <span className={`grid place-items-center rounded-lg bg-muted ${type.color}`} aria-hidden>
              <TypeIcon className="size-6" />
            </span>
          }
          title={t.title}
          badge={<StageMark stage={t.stage} missing={missing} className="text-sm" />}
          handles={
            <>
              <span className="font-mono text-xs">{code}</span>
              <span className="inline-flex items-center gap-1">
                <TaskTypeIcon taskType={t.taskType} className="size-3.5" />
                {taskTypeLabel(t.taskType)}
              </span>
              <span className="inline-flex items-center gap-1">
                <PriorityMark priority={t.priority} className="size-4" />
                {priorityLabel(t.priority)} priority
              </span>
              <span className="inline-flex items-center gap-1.5">
                {t.assignee ? (
                  <>
                    <Avatar className="size-4">
                      {t.assignee.imageUrl && <AvatarImage src={t.assignee.imageUrl} alt="" />}
                      <AvatarFallback className="text-[9px]">{(t.assignee.name ?? "?").charAt(0)}</AvatarFallback>
                    </Avatar>
                    {t.assignee.name ?? "Unnamed"}
                  </>
                ) : (
                  "Unassigned"
                )}
              </span>
            </>
          }
          stats={stats}
          status={
            <>
              <span>
                Created {format(new Date(t.createdAt), "d MMM yyyy")}
                {t.createdBy?.name ? ` by ${t.createdBy.name}` : ""}
              </span>
              <span aria-hidden>·</span>
              <span>{projectName}</span>
              {current && (
                <>
                  <span aria-hidden>·</span>
                  <SprintStatusMark status={current.status} />
                  <span>{current.name}</span>
                </>
              )}
            </>
          }
        />

        <DetailSection title="Description" className="border-t-0 pt-0">
          {t.description && t.description.replace(/<[^>]+>/g, "").trim() ? (
            <SafeHtml html={t.description} />
          ) : (
            <p className="text-sm text-muted-foreground">No description yet.</p>
          )}
        </DetailSection>

        <DetailSection title="Details" meta={mine.length ? `${answered} of ${mine.length} answered` : undefined}>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">This kind of task has no questions.</p>
          ) : (
            <dl className="flex flex-col gap-4">
              {answers.map(({ q, a }, i) => (
                <div key={q.id} className="flex flex-col gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    {i + 1}. {q.question}
                    {q.mandatory && (
                      <span className="ms-0.5 text-destructive" title="Required before the task leaves Missing data">
                        *
                      </span>
                    )}
                  </dt>
                  <dd className="text-sm">
                    <AnswerView answer={a} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </DetailSection>

        {t.sprints.length > 0 && (
          <DetailSection title="Sprints" meta={t.sprints.length}>
            <div className="flex flex-col gap-2" role="list">
              {t.sprints.map((s) => (
                <RecordRow
                  key={s.id}
                  title={s.name}
                  description={sprintDates(s)}
                  meta={
                    <>
                      <SprintStatusMark status={s.status} />
                      {s.estimatedMinutes ? <Fact label="Estimate">{formatMinutes(s.estimatedMinutes)}</Fact> : null}
                    </>
                  }
                />
              ))}
            </div>
          </DetailSection>
        )}

        {initialNotes.length > 0 && (
          <DetailSection title="Notes" meta={initialNotes.length}>
            <div className="flex flex-col gap-2" role="list">
              {initialNotes.map((n) => (
                <RecordRow
                  key={n.id}
                  href={hrefFromEntry({ kind: "note", id: childId(projectId || panel.data!.projectId, n.id) })}
                  leading={<NoteTypeIcon type={n.noteType} />}
                  title={n.title}
                  meta={
                    <>
                      <Chip variant="secondary">{noteTypeLabel(n.noteType)}</Chip>
                      <Fact>{format(new Date(n.date), "d MMM yyyy")}</Fact>
                      {n.author?.name && <Fact label="by">{n.author.name}</Fact>}
                    </>
                  }
                />
              ))}
            </div>
          </DetailSection>
        )}
      </div>
    </>
  );
}

/** Ready when every mandatory question of its kind has an answer and no client answer is pending (the road map's rule). */
function isReady(panel: TaskPanel): boolean {
  const { task, questions, initialAnswers } = panel;
  return computeIsReadyForTransition(
    questions.filter((q) => q.taskType === task.taskType),
    initialAnswers,
  );
}

function AnswerView({ answer: a }: { answer: Answer }) {
  switch (a.kind) {
    case "empty":
      return <span className="text-muted-foreground/70">—</span>;
    case "text":
      return <p className="whitespace-pre-wrap break-words">{a.text}</p>;
    case "link":
      return (
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
          {a.url}
        </a>
      );
    case "choices":
      return (
        <span className="flex flex-wrap gap-1.5">
          {a.values.map((v) => (
            <Chip key={v} variant="secondary">
              {v}
            </Chip>
          ))}
        </span>
      );
    case "files":
      return (
        <ul className="flex flex-col gap-1.5">
          {a.files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <a
                href={f.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm hover:bg-muted"
              >
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </a>
            </li>
          ))}
        </ul>
      );
    case "client":
      return (
        <div className="flex flex-col gap-1">
          <span>{a.needed ? "Needs the client" : "Nothing needed from the client"}</span>
          {a.needed && a.note && <p className="whitespace-pre-wrap text-muted-foreground">{a.note}</p>}
          {a.needed && (
            <span className={a.completed ? "inline-flex items-center gap-1 text-xs text-success" : "text-xs text-muted-foreground"}>
              {a.completed ? (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Received{a.completedAt ? ` ${format(new Date(a.completedAt), "d MMM yyyy")}` : ""}
                </>
              ) : (
                "Waiting on the client"
              )}
            </span>
          )}
        </div>
      );
  }
}
