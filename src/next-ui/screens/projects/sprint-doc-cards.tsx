"use client";

import * as React from "react";
import { AlertTriangle, Check, CheckCircle2, Circle, Clock, ImagePlus, Loader2, MinusCircle, PlusCircle, UserRound, Video, X } from "lucide-react";

import { REMOVED_BLURB, REMOVED_HEADING, type SprintCardCarry, type SprintRemovedTask } from "@/lib/sprint-doc";
import { DECISION_AS_DESCRIBED, planChoiceOf, RISK_NONE, type PlanChoice } from "@/lib/sprint-plan-choices";
import { formatPlanningAnswer, formatPlanningDate, summarizeSprintTasks, type SprintGaps, type SprintPlanningTask, type SprintTaskProof } from "@/lib/sprint-planning-doc";
import { formatFileSize, formatMinutes } from "@/next-ui/blocks/format";
import { useUpdatePlanTask, useUpdateSprintDocCard, useUpdateTaskPlan } from "@/next-ui/data/sprints";
import { uploadAttachments } from "@/next-ui/data/tasks";
import { cn } from "@/next-ui/lib/cn";
import { useDraft } from "@/next-ui/lib/use-draft";
import { EstimateField, errorText } from "@/next-ui/patterns/form-bits";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/next-ui/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/next-ui/ui/popover";

import { shortTitle } from "./sprint-doc-state";
import { taskTypeMark, TaskTypeIcon } from "./task-marks";

/**
 * The pieces of a sprint document, in the live panel's order: the summary tiles under the title,
 * the "missing" notice, the document's headings and prose, and a task's card. The card is one
 * framed box so nothing in it can be read as the next task's: its title band, the questions the
 * task was created with and their answers, then — under a rule — the plan for it (estimate,
 * person, Decision, Risk), and once the sprint has run, under another rule, how it went (the
 * proof of work, what was delivered or why it was not completed). Fields save on a short pause
 * and when they are left.
 */

/* ------------------------------------------------------------------------------------------ */
/* Prose                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export function DocHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("mt-12 mb-4 text-2xl font-semibold leading-snug", className)}>{children}</h2>;
}

export function DocSubheading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-10 mb-2 text-xl font-semibold leading-snug">{children}</h3>;
}

export function DocParagraph({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-sm leading-relaxed text-foreground/85", className)}>{children}</p>;
}

/* ------------------------------------------------------------------------------------------ */
/* Summary                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Why Start or End is not available yet, under the title: what is missing, or the one thing in the way. The header's ring button scrolls here. */
export function SprintMissing({ gaps, ref }: { gaps: SprintGaps; ref?: React.Ref<HTMLDivElement> }) {
  if (gaps.total <= 0 && !gaps.reason) return null;
  return (
    <div ref={ref} role="status" className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5" data-testid="sprint-missing">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-destructive">{gaps.total > 0 ? "Required fields missing" : gaps.reason}</p>
        {gaps.items.length > 0 && <p className="mt-0.5 text-xs text-destructive/80">{gaps.items.map((i) => i.label).join(" · ")}</p>}
      </div>
    </div>
  );
}

type Tile = { key: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; value: string; label: string; color: string };

function TileRow({ tiles, five }: { tiles: Tile[]; five?: boolean }) {
  return (
    <div className={cn("grid grid-cols-2 divide-x divide-y divide-border/60 @md:divide-y-0", five ? "@md:grid-cols-5" : "@md:grid-cols-4")}>
      {tiles.map((t) => (
        <div key={t.key} className="flex min-w-0 flex-col items-center gap-1.5 px-3 py-3.5 text-center">
          <t.icon className={cn("size-4 shrink-0", t.color)} strokeWidth={1.75} />
          <span className={cn("text-2xl font-bold tabular-nums leading-none", t.color)}>{t.value}</span>
          <span className="text-xs leading-tight text-muted-foreground">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

/** The tiles under the title: the work by type and its total time; in the review, how it went and how the scope moved. */
export function SprintSummary({ tasks, review = false, added = 0, removed = 0 }: { tasks: SprintPlanningTask[]; review?: boolean; added?: number; removed?: number }) {
  const stats = summarizeSprintTasks(tasks);
  const typeTile = (key: string, type: string, value: number, label: string): Tile => {
    const mark = taskTypeMark(type);
    return { key, icon: mark.icon, value: String(value), label, color: mark.color };
  };
  const types: Tile[] = [
    typeTile("bc", "FEATURE", stats.businessCases, "Business cases"),
    typeTile("en", "ENHANCEMENT", stats.enhancements, "Enhancements"),
    typeTile("bug", "BUG", stats.bugs, "Bugs"),
    typeTile("des", "DESIGN", stats.design, "Design"),
    { key: "time", icon: Clock, value: stats.totalMinutes ? formatMinutes(stats.totalMinutes) : "—", label: "Total time", color: "text-success" },
  ];
  return (
    <div className="@container mb-12 w-full overflow-hidden rounded-2xl border border-border/60 bg-card/50" aria-label="Sprint summary" data-testid="sprint-summary">
      <TileRow tiles={types} five />
      {review && (
        <div className="border-t border-border/60">
          <TileRow
            tiles={[
              { key: "done", icon: CheckCircle2, value: String(stats.completed), label: "Completed tasks", color: "text-success" },
              { key: "open", icon: Circle, value: String(stats.uncompleted), label: "Uncompleted tasks", color: "text-orange" },
              { key: "added", icon: PlusCircle, value: String(added), label: "Added to sprint", color: "text-success" },
              { key: "removed", icon: MinusCircle, value: String(removed), label: "Removed from sprint", color: "text-destructive" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Small controls                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** Writes gathered for a short pause and sent as one; `flush` sends what is pending now (on blur, on unmount). */
export function useDebouncedPatch<P extends object>(save: (patch: P) => void, delay = 600) {
  const timer = React.useRef<number | null>(null);
  const pending = React.useRef<Partial<P>>({});
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  });
  const flush = React.useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length > 0) saveRef.current(patch as P);
  }, []);
  const push = React.useCallback(
    (patch: Partial<P>) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [delay, flush],
  );
  React.useEffect(() => flush, [flush]);
  return { push, flush };
}

/** The estimate pill: the time, or a dashed mark that it is missing; a click turns it into the field. */
function EstimateControl({ minutes, missing, editable, onSave }: { minutes: number | null; missing: boolean; editable: boolean; onSave: (minutes: number | null) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState<number | null>(minutes);
  const [seen, setSeen] = React.useState(minutes);
  if (minutes !== seen) {
    setSeen(minutes);
    setValue(minutes);
  }
  if (editing) {
    return (
      <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-success/40 bg-background px-2">
        <Clock className="size-3.5 text-success" />
        <EstimateField
          value={value}
          onChange={setValue}
          autoFocus
          className="h-6 w-20 border-0 bg-transparent px-1 text-xs font-semibold tabular-nums text-success shadow-none focus-visible:ring-0"
          onBlur={() => {
            setEditing(false);
            if (value !== minutes) onSave(value);
          }}
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={!editable}
      onClick={() => setEditing(true)}
      title={editable ? "Set estimate" : undefined}
      data-testid="sprint-estimate"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors",
        minutes ? "border-success/30 text-success" : missing ? "border-dashed border-destructive/50 text-destructive" : "border-dashed border-muted-foreground/40 text-muted-foreground/50",
        editable && (minutes ? "hover:border-success/50" : "hover:border-destructive"),
        !editable && "cursor-default",
      )}
    >
      <Clock className="size-3.5" />
      {minutes ? formatMinutes(minutes) : editable ? "Add estimate" : "No estimate"}
    </button>
  );
}

export type Person = { id?: string; name: string | null; imageUrl: string | null };

function PersonMark({ person, missing, className }: { person: Person | null; missing?: boolean; className?: string }) {
  if (!person) {
    return (
      <span title="Unassigned" aria-label="Unassigned" className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-muted-foreground", missing ? "border-destructive text-destructive" : "border-muted-foreground/70", className)}>
        <UserRound className="size-3" />
      </span>
    );
  }
  return (
    <Avatar className={cn("size-5", className)} title={person.name ?? ""}>
      {person.imageUrl && <AvatarImage src={person.imageUrl} alt="" />}
      <AvatarFallback className="text-[9px]">{(person.name ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
    </Avatar>
  );
}

/** Who the task is for: a pill with the person's avatar and name, or a dashed mark that nobody is; a click opens the list. */
function AssigneeControl({ assignee, members, missing, editable, onSave }: { assignee: Person | null; members: Person[]; missing: boolean; editable: boolean; onSave: (id: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const pill = cn(
    "inline-flex h-8 max-w-full items-center gap-2 rounded-lg border text-xs font-semibold transition-colors",
    assignee ? "border-border ps-1.5 pe-3 text-foreground" : cn("border-dashed px-3", missing ? "border-destructive/50 text-destructive" : "border-muted-foreground/40 text-muted-foreground/50"),
  );
  const body = (
    <>
      {assignee ? <PersonMark person={assignee} /> : <UserRound className="size-3.5" />}
      <span className="truncate">{assignee ? (assignee.name ?? "Unnamed") : editable ? "Assign" : "Unassigned"}</span>
    </>
  );
  if (!editable) {
    return (
      <span className={cn(pill, "cursor-default")} data-testid="sprint-assignee">
        {body}
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={assignee?.name ? `Assigned to ${assignee.name}` : "Assign"} className={cn(pill, "outline-none focus-visible:ring-2 focus-visible:ring-ring/50", assignee ? "hover:border-foreground/40" : "hover:border-destructive")} data-testid="sprint-assignee">
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0">
        <Command>
          <CommandInput placeholder="Search people" />
          <CommandList>
            <CommandEmpty>No one by that name.</CommandEmpty>
            <CommandGroup>
              {members.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name ?? m.id}
                  onSelect={() => {
                    setOpen(false);
                    if ((m.id ?? null) !== (assignee?.id ?? null)) onSave(m.id ?? null);
                  }}
                >
                  <PersonMark person={m} className="size-5" />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.id === assignee?.id && <Check className="size-4" />}
                </CommandItem>
              ))}
              {assignee && (
                <CommandItem
                  value="__none"
                  onSelect={() => {
                    setOpen(false);
                    onSave(null);
                  }}
                >
                  <UserRound className="size-4 text-muted-foreground" />
                  Nobody yet
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** A labelled box of text in a card: Decision, Risk, the reason, what was delivered. */
export function DocField({
  id,
  label,
  required,
  value,
  onChange,
  onBlur,
  readOnly,
  placeholder,
  missing,
  action,
  onPaste,
  testId,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Required and empty: the box's edge says so. */
  missing?: boolean;
  /** Something beside the label (the "Add photo" button). */
  action?: React.ReactNode;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
  testId?: string;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label} {required ? <span className="text-destructive">*</span> : null}
        </label>
        {action}
      </div>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        required={required}
        rows={3}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        onPaste={onPaste}
        data-testid={testId}
        className={cn(
          "w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 read-only:cursor-default focus-visible:border-ring",
          missing ? "border-destructive/50" : "border-border",
        )}
      />
    </div>
  );
}

/** A note in a card that is not this document's to edit (why a task was added, why one was removed). */
function DocNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-sm font-semibold">{label}</p>
      <div className="rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

/** A labelled control in the plan block (Estimate, Assigned to), with the same label as the fields beside it. */
function PlanField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-2.5 text-sm font-semibold">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </p>
      {children}
    </div>
  );
}

/**
 * Decision or Risk as a choice first: two buttons, nothing pressed until someone presses one.
 * The first ("As described", "No risk") stores its stock sentence at once; the second
 * ("Different decision", "Risk") opens a box to write in, and the words are the value. A saved
 * value picks its button back on its own, so a document written in the live panel reads the
 * same here. Read-only, the choice shows as a mark with the words under it.
 */
export function ChoiceField({
  id,
  label,
  required,
  value,
  none,
  some,
  editable,
  missing,
  onCommit,
  onType,
  onBlur,
  testId,
}: {
  id: string;
  label: string;
  required?: boolean;
  /** The field's saved or typed words. */
  value: string;
  /** The "nothing" answer: its button and the sentence it stores. */
  none: { label: string; text: string };
  /** The written answer: its button and the box's hint. */
  some: { label: string; placeholder: string };
  editable: boolean;
  /** Required and still empty: the buttons (or the open box) say so. */
  missing?: boolean;
  /** A choice made: saved at once ("nothing" stores its sentence; "something" clears the stock one). */
  onCommit: (text: string) => void;
  /** Words typed into the box, saved after a pause. */
  onType: (text: string) => void;
  onBlur?: () => void;
  testId?: string;
}) {
  // the box stays open once "something" is chosen, even while it is still empty
  const [opened, setOpened] = React.useState(false);
  const saved = planChoiceOf(value, none.text);
  const choice: PlanChoice = saved ?? (opened ? "some" : null);
  const writing = choice === "some";
  const words = writing ? value : "";
  const pill = (active: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      active ? "border-foreground/60 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      missing && choice === null && "border-dashed border-destructive/50 text-destructive hover:border-destructive",
    );

  if (!editable) {
    return (
      <div data-testid={testId} data-choice={choice ?? "unset"}>
        <p className="mb-2.5 text-sm font-semibold">{label}</p>
        {choice === null ? (
          <p className="text-sm italic text-muted-foreground">Not chosen yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", choice === "none" ? "border-border text-muted-foreground" : "border-foreground/40 text-foreground")}>
              <Check className="size-3" strokeWidth={3} />
              {choice === "none" ? none.label : some.label}
            </span>
            {choice === "some" && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90" dir="auto">
                {value}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid={testId} data-choice={choice ?? "unset"}>
      <p id={`${id}-label`} className="mb-2.5 text-sm font-semibold">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={choice === "none"}
          className={pill(choice === "none")}
          onClick={() => {
            setOpened(false);
            onCommit(none.text);
          }}
          data-testid={testId ? `${testId}-none` : undefined}
        >
          {none.label}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={writing}
          className={pill(writing)}
          onClick={() => {
            setOpened(true);
            if (saved === "none") onCommit("");
          }}
          data-testid={testId ? `${testId}-some` : undefined}
        >
          {some.label}
        </button>
      </div>
      {writing && (
        <textarea
          id={id}
          value={words}
          required={required}
          rows={3}
          autoFocus={saved !== "some"}
          placeholder={some.placeholder}
          aria-label={`${label}: ${some.label}`}
          onChange={(e) => onType(e.target.value)}
          onBlur={onBlur}
          data-testid={testId ? `${testId}-text` : undefined}
          className={cn(
            "mt-3 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus-visible:border-ring",
            missing && words.trim() === "" ? "border-destructive/50" : "border-border",
          )}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* The task row and card                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** A task's name: its type, its title (shortened) and how many sprints it has seen. */
function TaskTitle({ task }: { task: SprintPlanningTask }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <TaskTypeIcon taskType={task.taskType} className="size-4" />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate text-sm" title={task.title} dir="auto">
          {shortTitle(task.title)}
        </span>
        {task.sprintCount >= 2 && (
          <span title={`In ${task.sprintCount} sprints`} className="inline-flex shrink-0 items-center rounded-lg border border-border px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {task.sprintCount}x
          </span>
        )}
      </span>
    </span>
  );
}

/** One task as a line in a list (what left the sprint): its name, then its controls, then a footer. */
export function SprintTaskLine({ task, trailing, footer, className }: { task: SprintPlanningTask; trailing?: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex w-full flex-col items-stretch gap-3 rounded-md border border-border bg-card px-3 py-4", className)} data-testid="sprint-task-line">
      <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
        <TaskTitle task={task} />
        {trailing && <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:ps-7">{trailing}</div>}
      </div>
      {footer}
    </div>
  );
}

export type SprintCardVariant = "planning" | "completed" | "incomplete" | "removed";

export function SprintTaskCard({
  task,
  variant,
  projectId,
  sprintId,
  members,
  canEditPlan,
  canEditCard,
  hideAssignee,
  proof,
  carry,
  onReason,
  movedTo,
  removedReason,
  onError,
}: {
  task: SprintPlanningTask;
  variant: SprintCardVariant;
  projectId: string;
  sprintId: string;
  members: Person[];
  /** Estimate, person, Decision and Risk may be changed (the sprint is being planned, by someone who may). */
  canEditPlan: boolean;
  /** The outcome's answers may be written (the sprint runs, by someone who may end it; or an admin). */
  canEditCard: boolean;
  hideAssignee: boolean;
  proof?: SprintTaskProof;
  carry?: SprintCardCarry;
  /** The reason as it is typed, so the page can count what End still waits for. */
  onReason?: (taskId: string, reason: string) => void;
  movedTo?: string | null;
  removedReason?: string;
  onError: (text: string | null) => void;
}) {
  const isPlanning = variant === "planning";
  const isCompleted = variant === "completed";
  const isIncomplete = variant === "incomplete";
  const isRemoved = variant === "removed";
  const planTask = useUpdatePlanTask(projectId, sprintId);
  const taskPlan = useUpdateTaskPlan(projectId, sprintId);
  const card = useUpdateSprintDocCard(projectId, sprintId);
  const fail = (err: unknown) => onError(errorText(err));

  const [decision, setDecision] = useDraft(task.decision ?? "");
  const [risk, setRisk] = useDraft(task.risk ?? "");
  const plan = useDebouncedPatch<{ decision?: string; risk?: string }>((patch) => {
    onError(null);
    taskPlan.mutate({ taskId: task.id, ...patch }, { onError: fail });
  });

  const [reason, setReason] = useDraft(carry?.incompleteReason ?? "");
  const [description, setDescription] = useDraft(carry?.description ?? "");
  const images = carry?.descriptionImages ?? [];
  const answers = useDebouncedPatch<Partial<SprintCardCarry>>((patch) => {
    onError(null);
    card.mutate({ taskId: task.id, ...patch }, { onError: fail });
  });
  const [uploading, setUploading] = React.useState(0);
  const imageInput = React.useRef<HTMLInputElement | null>(null);

  const addImages = async (files: File[]) => {
    const picked = files.filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) return;
    setUploading((n) => n + picked.length);
    try {
      const uploaded = await uploadAttachments(picked, () => {});
      answers.flush();
      card.mutate({ taskId: task.id, descriptionImages: [...images, ...uploaded.map((u) => u.url)] }, { onError: fail });
    } catch (err) {
      fail(err);
    } finally {
      setUploading((n) => Math.max(0, n - picked.length));
    }
  };

  const decisionEmpty = decision.trim() === "";
  const riskEmpty = risk.trim() === "";
  // Decision and Risk follow the task into the outcome, read-only there; work pulled in mid-sprint has neither.
  const showPlanFields = isPlanning || !decisionEmpty || !riskEmpty;
  const addedReason = (task.unplannedReason ?? "").trim();
  const hasOutcome = isCompleted || isIncomplete || isRemoved || addedReason !== "";
  const videos = proof?.videos ?? [];
  const hasVideos = videos.length > 0;

  return (
    <article className="@container my-10 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-testid="sprint-task-card" data-variant={variant}>
      <header className="flex items-center gap-3 bg-muted/40 px-4 py-3 font-medium" data-testid="sprint-task-head">
        <TaskTitle task={task} />
      </header>
      {task.questions.length > 0 && (
        <div className="space-y-5 px-4 py-5 text-sm leading-relaxed" data-testid="sprint-task-qa">
          {task.questions.map((q, i) => (
            <div key={i} className="space-y-2">
              <p dir="auto">
                <strong>Q:</strong> {q.question}
              </p>
              <p dir="auto">
                <strong>A:</strong> {formatPlanningAnswer(q.answer)}
              </p>
            </div>
          ))}
        </div>
      )}
      <section className="flex flex-col gap-6 px-4 py-5" aria-label="Plan for this task" data-testid="sprint-task-plan">
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 @sm:grid-cols-2">
          <PlanField label="Estimate" required={isPlanning}>
            <EstimateControl minutes={task.estimatedMinutes} missing={isPlanning} editable={canEditPlan && isPlanning} onSave={(m) => planTask.mutate({ taskId: task.id, estimatedMinutes: m }, { onError: fail })} />
          </PlanField>
          {!hideAssignee && (
            <PlanField label="Assigned to" required={isPlanning}>
              <AssigneeControl assignee={task.assignee} members={members} missing={isPlanning} editable={canEditPlan && isPlanning} onSave={(id) => planTask.mutate({ taskId: task.id, assigneeId: id }, { onError: fail })} />
            </PlanField>
          )}
        </div>
        {showPlanFields && (
          <>
            <ChoiceField
              id={`decision-${task.id}`}
              label="Decision"
              required={isPlanning}
              value={decision}
              none={{ label: "As described", text: DECISION_AS_DESCRIBED }}
              some={{ label: "Different decision", placeholder: "What was decided instead?" }}
              editable={canEditPlan && isPlanning}
              missing={isPlanning && decisionEmpty}
              onCommit={(v) => {
                setDecision(v);
                plan.push({ decision: v });
                plan.flush();
              }}
              onType={(v) => {
                setDecision(v);
                plan.push({ decision: v.trim() });
              }}
              onBlur={plan.flush}
              testId="sprint-decision"
            />
            <ChoiceField
              id={`risk-${task.id}`}
              label="Risk"
              required={isPlanning}
              value={risk}
              none={{ label: "No risk", text: RISK_NONE }}
              some={{ label: "Risk", placeholder: "What could block or delay this item?" }}
              editable={canEditPlan && isPlanning}
              missing={isPlanning && riskEmpty}
              onCommit={(v) => {
                setRisk(v);
                plan.push({ risk: v });
                plan.flush();
              }}
              onType={(v) => {
                setRisk(v);
                plan.push({ risk: v.trim() });
              }}
              onBlur={plan.flush}
              testId="sprint-risk"
            />
          </>
        )}
      </section>
      {hasOutcome && (
        <section className="flex flex-col gap-6 px-4 py-5" aria-label="How it went" data-testid="sprint-task-outcome">
          {addedReason && !isRemoved && <DocNote label="Reason for adding">{addedReason}</DocNote>}
          {isRemoved && (
            <DocNote label="Reason for removing">
              {removedReason || "No reason was recorded."}
              {movedTo && (
                <p className="mt-2">
                  Moved to <span className="font-medium text-foreground">{movedTo}</span>.
                </p>
              )}
            </DocNote>
          )}
          {isCompleted && (
            <div data-testid="sprint-proof">
              <p className="mb-2.5 text-sm font-semibold">Proof of work</p>
              {hasVideos ? (
                <ul className="flex flex-col gap-1">
                  {videos.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
                      <Video className="size-4 shrink-0 text-muted-foreground" />
                      <a href={v.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                        {v.filename}
                      </a>
                      <span className="text-xs text-muted-foreground">{formatFileSize(v.fileSize)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-border px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                  {proof?.notRequired
                    ? "This project records the sprint review video instead of a video per task."
                    : proof?.bypassedAtIso
                      ? `The proof requirement was waived on ${formatPlanningDate(proof.bypassedAtIso)}${proof.bypassedByName ? ` by ${proof.bypassedByName}` : ""}.`
                      : "No proof of work was recorded for this item."}
                </p>
              )}
            </div>
          )}
          {isCompleted && !hasVideos && (
            <div>
              <DocField
                id={`delivered-${task.id}`}
                label="What was delivered"
                required={canEditCard}
                value={description}
                readOnly={!canEditCard}
                placeholder="Describe what was delivered. Paste a screenshot here to attach it."
                onChange={(v) => {
                  setDescription(v);
                  answers.push({ description: v });
                }}
                onBlur={answers.flush}
                onPaste={(e) => {
                  if (!canEditCard) return;
                  const files = Array.from(e.clipboardData.items)
                    .filter((item) => item.type.startsWith("image/"))
                    .map((item) => item.getAsFile())
                    .filter((f): f is File => f != null);
                  if (files.length === 0) return;
                  e.preventDefault();
                  void addImages(files);
                }}
                action={
                  canEditCard ? (
                    <button type="button" onClick={() => imageInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground" data-testid="sprint-add-photo">
                      {uploading > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                      Add photo
                    </button>
                  ) : undefined
                }
                testId="sprint-delivered"
              />
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addImages(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              {images.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {images.map((src) => (
                    <div key={src} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="max-h-48 rounded-md border border-border object-contain" />
                      {canEditCard && (
                        <button
                          type="button"
                          aria-label="Remove photo"
                          onClick={() => card.mutate({ taskId: task.id, descriptionImages: images.filter((u) => u !== src) }, { onError: fail })}
                          className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-background/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {isIncomplete && (
            <DocField
              id={`reason-${task.id}`}
              label="Reason it was not completed"
              required
              value={reason}
              readOnly={!canEditCard}
              placeholder="Why was this item incomplete or deferred?"
              missing={reason.trim() === ""}
              onChange={(v) => {
                setReason(v);
                onReason?.(task.id, v);
                answers.push({ incompleteReason: v });
              }}
              onBlur={answers.flush}
              testId="sprint-incomplete-reason"
            />
          )}
        </section>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* What left the sprint                                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * What has left the sprint since it started — shown beside the document while it runs. The
 * reasons were given when the work was moved; when the sprint closes the server writes this
 * list into the document itself and the panel is no longer drawn.
 */
export function SprintRemovedPanel({ removed }: { removed: SprintRemovedTask[] }) {
  if (removed.length === 0) return null;
  return (
    <section className="mt-16 border-t border-border pt-10" data-testid="sprint-removed-panel">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        <MinusCircle className="size-5 shrink-0 text-destructive" strokeWidth={2} />
        {REMOVED_HEADING}
        <span className="text-lg font-semibold tabular-nums text-muted-foreground">{removed.length}</span>
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{REMOVED_BLURB}</p>
      <div className="mt-5 space-y-3">
        {removed.map((entry) => (
          <SprintTaskLine
            key={entry.task.id}
            task={entry.task}
            trailing={entry.task.estimatedMinutes ? <EstimateControl minutes={entry.task.estimatedMinutes} missing={false} editable={false} onSave={() => {}} /> : undefined}
            footer={
              entry.reason || entry.movedTo ? (
                <div className="space-y-1 border-t border-border/60 pt-3 text-sm leading-relaxed text-muted-foreground">
                  {entry.reason && (
                    <p>
                      <span className="font-semibold text-foreground">Reason for removing:</span> {entry.reason}
                    </p>
                  )}
                  {entry.movedTo && (
                    <p>
                      Moved to <span className="font-medium text-foreground">{entry.movedTo}</span>.
                    </p>
                  )}
                </div>
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
