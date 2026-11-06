"use client";

import * as React from "react";
import { format } from "date-fns";
import { ArrowRight, CheckCircle2, Film, ListChecks, Paperclip, Trash2, Undo2, UserPlus } from "lucide-react";

import type { TaskProofVideo } from "@/actions/proof-of-work";
import { isRoadmapNote } from "@/lib/project-note-url";
import { formatDuration } from "@/lib/task-history-format";
import { priorityLabel, stageLabel, TASK_PRIORITIES, taskCode, taskTypeLabel, type TaskPriorityId } from "@/lib/task-label";
import { computeIsReadyForTransition, isMissingDataTask, isQuestionAnswerFilled, isReadinessQuestion } from "@/lib/task-readiness";
import { Chip, Fact, HeaderCardSkeleton, RecordRow } from "@/next-ui/blocks";
import { useProject } from "@/next-ui/data/projects";
import {
  taskErrorText,
  useAssignTaskToMe,
  useDeleteTask,
  useProjectTasks,
  useSaveTaskAnswers,
  useTask,
  useTaskHistory,
  useTaskProofVideos,
  useUpdateTask,
  type TaskPanel,
  type TaskRow,
} from "@/next-ui/data/tasks";
import { cn } from "@/next-ui/lib/cn";
import { SafeHtml } from "@/next-ui/lib/safe-html";
import { useDraft } from "@/next-ui/lib/use-draft";
import { useViewer } from "@/next-ui/lib/viewer";
import { childId, hrefFromEntry, splitChildId, usePane } from "@/next-ui/panes";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { ConfirmDialog, ErrorNote, InfoNote } from "@/next-ui/patterns/form-bits";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { PageHeader } from "@/next-ui/patterns/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { Button } from "@/next-ui/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/next-ui/ui/select";
import { Skeleton } from "@/next-ui/ui/skeleton";

import { activeSprintStages, formatMinutes, sprintDates, sprintStageMoves } from "./board-state";
import { noteTypeLabel, NoteTypeIcon } from "./note-marks";
import { viewerRights } from "./project-screen";
import { parseAnswer, type Answer } from "./task-answers";
import { QuestionInput, SaveMark, TaskComments, useAutosave, type SaveState } from "./task-edit";
import { historyLines, historySummaryText } from "./task-history";
import { PriorityMark, SprintStatusMark, StageMark, TaskTypeIcon } from "./task-marks";
import { useStageMove } from "./use-stage-move";

/**
 * One task as a form, with the live panel's fields and rules and nothing folded away. Top to
 * bottom: the title; the details (type, who has it, who raised it, priority, status); the sprints
 * it has been in, each with the estimate it was given there — an estimate belongs to a sprint,
 * not to the task; the questions its kind asks, each with its answer under it; the notes about
 * it; the videos that proved its work; the comments; and its history for those who may see it.
 *
 * Every field saves on its own, with a word beside its label saying so. The rules are the live
 * panel's: someone the server lets edit the task (the reason is shown when not) changes its
 * priority at any stage, but the title and the answers only while it is still in the backlog —
 * once it has been picked up they are kept as they were. A required question still empty keeps
 * the task in Missing data, and is marked. The one assignee control is taking ownership, as on
 * the live page; a system admin moves the task forward (or declines it from review) through the
 * sprint board's checkpoints; others move it on the board.
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
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6" aria-busy>
          <HeaderCardSkeleton />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
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

  return <TaskBody key={panel.data.task.id} panel={panel.data} projectId={projectId || panel.data.projectId} taskId={taskId} />;
}

type Question = TaskPanel["questions"][number];

/** Answers that are words wait for a pause before saving; a choice, a file or a pressed button saves at once. */
function typedAnswer(q: Question): boolean {
  return q.type !== "select" && q.type !== "file";
}

function TaskBody({ panel, projectId, taskId }: { panel: TaskPanel; projectId: string; taskId: string }) {
  const pane = usePane();
  const viewer = useViewer();
  const project = useProject(projectId);
  const tasks = useProjectTasks(projectId);
  const rights = React.useMemo(() => viewerRights(project.data ?? { members: [], contracts: [] }, viewer?.id, viewer?.systemRole), [project.data, viewer?.id, viewer?.systemRole]);
  const stageMove = useStageMove(projectId, rights);
  const assignMe = useAssignTaskToMe(projectId, taskId);
  const del = useDeleteTask(projectId);
  const update = useUpdateTask(projectId, taskId);
  const saveAnswers = useSaveTaskAnswers(projectId, taskId);
  const proof = useTaskProofVideos(taskId);
  const history = useTaskHistory(taskId, viewer != null);
  const save = useAutosave();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmOwn, setConfirmOwn] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState<Record<string, number>>({});

  const { task: t, questions, initialAnswers, initialNotes, editBlockedReason, canDelete } = panel;
  const code = taskCode(t.taskType, t.taskNumber);
  const canEdit = editBlockedReason == null && Boolean(viewer) && !rights.isClient;
  // the answers say what the task is; once it has been picked up they are kept as they were (the live panel's rule), and so is the title
  const inBacklog = t.stage === "BACKLOG";
  const canAnswer = canEdit && inBacklog;

  // a refused save is said once, above the form, and the field's mark turns red
  const guarded = (fn: () => Promise<unknown>) => () =>
    fn().then(
      () => setNotice(null),
      (err: unknown) => {
        setNotice(taskErrorText(err));
        throw err;
      },
    );

  const [title, setTitle] = useDraft(t.title);
  const commitTitle = () => {
    const next = title.trim();
    if (next === "" || next === t.title) {
      setTitle(t.title);
      return;
    }
    void save.now("title", guarded(() => update.mutateAsync({ title: next })));
  };

  const [priority, setPriority] = useDraft(t.priority as TaskPriorityId);

  // answers as typed; the server's echo after a save leaves them alone (as the live panel does)
  const [answers, setAnswers] = React.useState<Record<string, string>>(initialAnswers);
  const mine = questions.filter((q) => q.taskType === t.taskType);
  const parsed = mine.map((q) => ({ q, a: parseAnswer(q, answers[q.id]) }));
  const answered = parsed.filter((x) => x.a.kind !== "empty").length;
  const ready = computeIsReadyForTransition(mine, answers);
  const missing = isMissingDataTask({ stage: t.stage, isReadyForTransition: ready });
  const setAnswer = (q: Question, value: string) => {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    const write = guarded(() => saveAnswers.mutateAsync([{ questionId: q.id, answer: value }]));
    if (typedAnswer(q)) save.schedule(q.id, write);
    else void save.now(q.id, write);
  };

  // the live page offers the stage moves to system admins; the server only moves work inside a running sprint
  const current = t.sprints[0];
  const row = tasks.data?.find((x) => x.id === t.id) ?? null;
  const inRunningSprint = current?.status === "ACTIVE";
  const moves = rights.isSystemAdmin && inRunningSprint ? sprintStageMoves(inBacklog ? "TODO" : t.stage) : [];
  const moveTo = (to: string) => {
    const task: TaskRow = row ?? ({ ...t, stage: t.stage, order: t.order, sprintId: current?.id ?? null, createdBy: t.createdBy } as unknown as TaskRow);
    const order = tasks.data && current ? (activeSprintStages(tasks.data, current.id)[to as "TODO"]?.length ?? 0) : 0;
    stageMove.request(task, to, order);
  };
  // taking ownership is the live page's one assignee control, for someone whose role may move the task at this stage
  const mayOwn =
    viewer != null && !rights.isClient && t.assignee?.id !== viewer.id && (rights.isSystemAdmin || (rights.canMoveTasks && (rights.perms.allowedTransitions[t.stage]?.length ?? 0) > 0));

  const notes = initialNotes.filter((n) => !isRoadmapNote(n.noteType));
  const hasDescription = Boolean(t.description && t.description.replace(/<[^>]+>/g, "").trim());
  const proofCount = (proof.data?.approved.length ?? 0) + (proof.data?.history.length ?? 0);
  const life = history.data?.allowed ? history.data : null;
  const lines = React.useMemo(() => (life ? historyLines(life.visits, life.activities) : []), [life]);

  const actions = canDelete ? <HeaderAction label="Delete task" icon={<Trash2 />} variant="ghost" onClick={() => setConfirmDelete(true)} data-testid="delete-task" /> : undefined;

  return (
    <>
      <PageHeader title={`${code} · ${t.title}`} actions={actions} />

      <div className="@container mx-auto flex w-full max-w-3xl flex-col gap-10 pb-10" data-testid="task-form" data-stage={t.stage}>
        {editBlockedReason && viewer && !rights.isClient && <InfoNote>{editBlockedReason}</InfoNote>}
        {(notice || stageMove.notice) && (
          <ErrorNote
            onClose={() => {
              setNotice(null);
              stageMove.clearNotice();
            }}
          >
            {notice ?? stageMove.notice}
          </ErrorNote>
        )}

        {/* Title */}
        <Field id="task-title" label="Title" state={save.state.title}>
          {canAnswer ? (
            <textarea
              id="task-title"
              value={title}
              rows={1}
              dir="auto"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setTitle(t.title);
                  e.currentTarget.blur();
                }
              }}
              className="w-full field-sizing-content resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-lg font-semibold leading-snug break-words outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              data-testid="task-title"
            />
          ) : (
            <ReadBox className="px-3 py-2">
              <h2 className="min-w-0 text-lg font-semibold leading-snug break-words" dir="auto" data-testid="task-title">
                {t.title}
              </h2>
            </ReadBox>
          )}
        </Field>

        {/* Details — the live page's rows, as fields */}
        <FormSection title="Details" testId="task-details">
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 @md:grid-cols-2">
            <Field id="task-type" label="Type">
              <ReadBox>
                <TaskTypeIcon taskType={t.taskType} className="size-4" />
                {taskTypeLabel(t.taskType)}
              </ReadBox>
            </Field>
            <Field id="task-assignee" label="Assigned to">
              <div className="flex flex-wrap items-center gap-2">
                <ReadBox className="min-w-0 flex-1" data-testid="task-assignee">
                  {t.assignee ? (
                    <>
                      <PersonAvatar person={t.assignee} />
                      <span className="truncate">{t.assignee.name ?? "Unnamed"}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </ReadBox>
                {mayOwn && (
                  <Button type="button" variant="outline" size="sm" disabled={assignMe.isPending} onClick={() => setConfirmOwn(true)} data-testid="assign-me">
                    <UserPlus />
                    Assign to me
                  </Button>
                )}
              </div>
            </Field>
            <Field id="task-reporter" label="Reported by">
              <ReadBox>
                {t.createdBy ? (
                  <>
                    <PersonAvatar person={t.createdBy} />
                    {t.createdBy.name ?? "Unnamed"}
                  </>
                ) : (
                  <span className="text-muted-foreground">Unknown</span>
                )}
              </ReadBox>
            </Field>
            <Field id="task-priority" label="Priority" state={save.state.priority}>
              {canEdit ? (
                <Select
                  value={priority}
                  onValueChange={(v) => {
                    const next = v as TaskPriorityId;
                    if (next === priority) return;
                    setPriority(next);
                    void save.now("priority", guarded(() => update.mutateAsync({ priority: next })));
                  }}
                >
                  <SelectTrigger id="task-priority" className="w-full" data-testid="task-priority">
                    <SelectValue>
                      <PriorityMark priority={priority} className="size-3.5" />
                      {priorityLabel(priority)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((pr) => (
                      <SelectItem key={pr} value={pr}>
                        <PriorityMark priority={pr} className="size-3.5" />
                        {priorityLabel(pr)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <ReadBox>
                  <PriorityMark priority={t.priority} className="size-4" />
                  {priorityLabel(t.priority)}
                </ReadBox>
              )}
            </Field>
            <div className="@md:col-span-2">
              <Field id="task-status" label="Status" hint={missing ? "Answer the required questions (*) below to take the task out of Missing data." : undefined}>
                <div className="flex flex-wrap items-center gap-2">
                  <ReadBox>
                    <StageMark stage={t.stage} missing={missing} className="text-sm text-foreground" />
                  </ReadBox>
                  {moves.map((m) => (
                    <Button key={m.to} type="button" variant="outline" size="sm" disabled={stageMove.busy} onClick={() => moveTo(m.to)} data-testid={`move-to-${m.to}`}>
                      {m.decline ? <Undo2 /> : <ArrowRight />}
                      {m.decline ? "Decline" : `Move forward to ${stageLabel(m.to)}`}
                    </Button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </FormSection>

        {/* Sprints — the estimate belongs to each sprint the task was in */}
        <FormSection title="Sprints history" meta={t.sprints.length || undefined} testId="task-sprints">
          {t.sprints.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not in a sprint.</p>
          ) : (
            <div className="flex flex-col gap-2" role="list">
              {t.sprints.map((s) => (
                <RecordRow
                  key={s.id}
                  href={hrefFromEntry({ kind: "sprint", id: childId(projectId, s.id) })}
                  title={s.name}
                  description={sprintDates(s)}
                  meta={
                    <>
                      <SprintStatusMark status={s.status} />
                      <Fact label="Estimate">{s.estimatedMinutes ? formatMinutes(s.estimatedMinutes) : "—"}</Fact>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </FormSection>

        {/* The questions, each with its answer under it */}
        <FormSection
          title="Questions"
          meta={mine.length ? `${answered} of ${mine.length} answered` : undefined}
          hint={
            mine.length === 0
              ? undefined
              : !inBacklog
                ? "The answers were given while the task was in the backlog and are kept as they were."
                : canAnswer
                  ? "Answers save as you go. Starred questions must be answered before the task leaves Missing data."
                  : undefined
          }
          testId="task-questions"
        >
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">This kind of task has no questions.</p>
          ) : (
            <ol className="flex flex-col gap-6">
              {parsed.map(({ q, a }, i) => {
                const id = `q-${q.id}`;
                const needs = inBacklog && isReadinessQuestion(q) && !isQuestionAnswerFilled(q.type, answers[q.id]);
                const state: SaveState | undefined = uploading[q.id] ? "saving" : save.state[q.id];
                return (
                  <li key={q.id} data-testid="task-question" data-answered={a.kind !== "empty"}>
                    <Field id={id} label={`${i + 1}. ${q.question}`} required={q.mandatory} state={state}>
                      {canAnswer ? (
                        <QuestionInput
                          id={id}
                          question={q}
                          value={answers[q.id] ?? ""}
                          missing={needs}
                          onChange={(v) => setAnswer(q, v)}
                          onBlur={() => save.flush(q.id)}
                          onUploading={(on) => setUploading((prev) => ({ ...prev, [q.id]: Math.max(0, (prev[q.id] ?? 0) + (on ? 1 : -1)) }))}
                          onError={setNotice}
                        />
                      ) : (
                        <AnswerBox answer={a} missing={needs} type={q.type} />
                      )}
                    </Field>
                  </li>
                );
              })}
            </ol>
          )}
        </FormSection>

        {hasDescription && (
          <FormSection title="Description" testId="task-description">
            <SafeHtml html={t.description ?? ""} />
          </FormSection>
        )}

        <FormSection title="Notes" meta={notes.length || undefined} testId="task-notes">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes attached.</p>
          ) : (
            <div className="flex flex-col gap-2" role="list">
              {notes.map((n) => (
                <RecordRow
                  key={n.id}
                  href={hrefFromEntry({ kind: "note", id: childId(projectId, n.id) })}
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
          )}
        </FormSection>

        {proofCount > 0 && proof.data && (
          <FormSection title="Proof of work" meta={proofCount} testId="task-proof">
            <ul className="flex flex-col gap-2">
              {proof.data.approved.map((v) => (
                <ProofVideoRow key={v.id} video={v} tag="Approved" />
              ))}
              {proof.data.history.map((v) => (
                <ProofVideoRow key={v.id} video={v} tag="Earlier" />
              ))}
            </ul>
          </FormSection>
        )}

        <FormSection title="Comments" testId="comments-section">
          <TaskComments taskId={t.id} viewerId={viewer?.id ?? null} canWrite={Boolean(viewer) && !rights.isClient} />
        </FormSection>

        {life && (
          <FormSection title="History" meta={`${formatDuration(life.summary.totalMs)} in total`} hint={historySummaryText(life.summary, (s) => stageLabel(s)) || undefined} testId="task-history">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ol className="ms-1.5 flex flex-col gap-4 border-s border-border ps-5">
                {lines.map((l) => (
                  <li key={l.id} className="relative text-sm" data-kind={l.kind}>
                    <i aria-hidden className={cn("absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-background", l.kind === "stage" ? "bg-foreground" : "bg-muted-foreground/60")} />
                    <p className="leading-snug">{l.text}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {format(l.at, "d MMM yyyy, HH:mm")}
                      {l.stay ? ` · ${l.stay}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </FormSection>
        )}
      </div>

      <ConfirmDialog
        open={confirmOwn}
        onClose={() => setConfirmOwn(false)}
        title="Taking ownership"
        description={
          t.assignee
            ? `This task is with ${t.assignee.name ?? "someone else"} now. By confirming, it is assigned to you and you take ownership of it.`
            : "By confirming, this task is assigned to you and you take ownership of it."
        }
        confirmLabel="Assign to me"
        busyLabel="Assigning…"
        onConfirm={async () => {
          // a refusal (the role, the stage, the contract) is said in the dialog, which stays open
          await assignMe.mutateAsync();
        }}
        testId="assign-me-dialog"
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete task"
        description={`"${t.title}" and its comments, answers and history are removed. This cannot be undone.`}
        confirmLabel="Delete task"
        busyLabel="Deleting…"
        destructive
        onConfirm={async () => {
          await del.mutateAsync(t.id);
          pane.back();
        }}
        testId="delete-task-dialog"
      />
      {stageMove.dialogs}
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* The form's pieces                                                                           */
/* ------------------------------------------------------------------------------------------ */

/** A part of the form under a heading, with a count or a word on the right and a line of help under it. */
function FormSection({ title, meta, hint, children, testId }: { title: string; meta?: React.ReactNode; hint?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-5" aria-label={title} data-testid={testId}>
      <div className="flex flex-col gap-1 border-b border-border pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {meta != null && <span className="text-xs text-muted-foreground">{meta}</span>}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A labelled field: the label (with a star when required), the word saying it is saving, the control, a line of help. */
function Field({ id, label, required, state, hint, children }: { id: string; label: string; required?: boolean; state?: SaveState; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} id={`${id}-label`} className="text-sm font-semibold leading-snug" dir="auto">
          {label}
          {required && (
            <span className="ms-0.5 text-destructive" title="Required before the task leaves Missing data">
              *
            </span>
          )}
        </label>
        <SaveMark state={state} />
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A value that is read, not changed, drawn at the height of the controls beside it. */
function ReadBox({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex min-h-8 items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1 text-sm", className)} {...rest}>
      {children}
    </div>
  );
}

function PersonAvatar({ person }: { person: { name: string | null; imageUrl: string | null } }) {
  return (
    <Avatar className="size-5">
      {person.imageUrl && <AvatarImage src={person.imageUrl} alt="" />}
      <AvatarFallback className="text-[9px]">{(person.name ?? "?").charAt(0)}</AvatarFallback>
    </Avatar>
  );
}

/** An answer that is read, not changed; an empty one says so in the words of its kind, and a required one that is empty is marked. */
function AnswerBox({ answer: a, missing, type }: { answer: Answer; missing?: boolean; type: string }) {
  if (a.kind === "empty") {
    const words = type === "file" ? "No files attached." : type === "select" ? "Nothing chosen." : type === "client" ? "Not decided." : "Not answered.";
    return (
      <div className={cn("rounded-lg border border-dashed px-3 py-2 text-sm", missing ? "border-destructive/50 text-destructive" : "border-border text-muted-foreground")} data-testid="answer-empty">
        {missing ? `${words} Required before the task leaves Missing data.` : words}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm" data-testid="answer">
      <AnswerView answer={a} />
    </div>
  );
}

function AnswerView({ answer: a }: { answer: Answer }) {
  switch (a.kind) {
    case "empty":
      return <span className="text-muted-foreground/70">—</span>;
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words leading-relaxed" dir="auto">
          {a.text}
        </p>
      );
    case "link":
      return (
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2" dir="ltr">
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
              <a href={f.url || undefined} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm hover:bg-muted">
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
          {a.needed && a.note && (
            <p className="whitespace-pre-wrap text-muted-foreground" dir="auto">
              {a.note}
            </p>
          )}
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

/** One recorded video: its name, when it was recorded and whether it is the approved proof; pressed, it plays in place. */
function ProofVideoRow({ video, tag }: { video: TaskProofVideo; tag: "Approved" | "Earlier" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-2" data-testid="proof-video" data-tag={tag}>
      <button type="button" className="flex w-full items-center gap-3 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", tag === "Approved" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
          <Film className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{video.filename}</span>
          <span className="block text-xs text-muted-foreground">{format(new Date(video.createdAt), "d MMM yyyy, HH:mm")}</span>
        </span>
        <Chip variant={tag === "Approved" ? "default" : "secondary"}>{tag}</Chip>
      </button>
      {open && <video controls preload="metadata" src={video.url} className="max-h-96 w-full rounded-md bg-black" />}
    </li>
  );
}
