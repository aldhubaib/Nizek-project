"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Loader2, MessageCircleQuestion, History, MessageSquare,
  ChevronRight, ChevronDown, Pencil, Check, Clock, Undo2, Gauge, Timer,
  FileText, Plus,
} from "lucide-react";
import { getTaskAnswers, saveTaskAnswers } from "@/actions/task-question";
import { updateTask, moveTask as moveTaskAction, declineTask } from "@/actions/task";
import { createMeetingNote, getTaskNotes } from "@/actions/meeting-note";
import { RichTextEditor } from "@/components/rich-text-editor";
import { formatDistanceToNow } from "date-fns";
import { QuestionField, type TaskQuestion } from "@/components/kanban/question-field";
import { ActivityTimeline } from "@/components/kanban/activity-timeline";
import { CommentSection } from "@/components/kanban/comment-section";
import { StageConfirmDialog, getCheckpoint } from "@/components/kanban/stage-confirm-dialog";
import { cn } from "@/lib/utils";

const ACCURACY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  WAY_OVER:  { label: "Way Over",  color: "text-destructive",  bg: "bg-destructive/20 border-destructive/40" },
  OVER:      { label: "Over",      color: "text-orange-400",   bg: "bg-orange-500/20 border-orange-500/40" },
  ON_TRACK:  { label: "On Track",  color: "text-emerald-400",  bg: "bg-emerald-500/20 border-emerald-500/40" },
  UNDER:     { label: "Under",     color: "text-blue-400",     bg: "bg-blue-500/20 border-blue-500/40" },
  WAY_UNDER: { label: "Way Under", color: "text-violet-400",   bg: "bg-violet-500/20 border-violet-500/40" },
};

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatDuration(from: Date, to: Date): string {
  const ms = to.getTime() - from.getTime();
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

const TASK_TYPE_META: Record<string, { prefix: string; label: string; color: string }> = {
  FEATURE: { prefix: "F", label: "Feature", color: "text-primary" },
  ENHANCEMENT: { prefix: "E", label: "Enhancement", color: "text-violet-400" },
  BUG: { prefix: "B", label: "Internal Bug", color: "text-amber-400" },
  REPORTED_BUG: { prefix: "RB", label: "Reported Bug", color: "text-destructive" },
  DESIGN: { prefix: "D", label: "Design", color: "text-cyan-400" },
};

type Stage = "NEW_REQUEST" | "CLARIFICATION" | "READY_FOR_DEV" | "IN_DEVELOPMENT" | "INTERNAL_REVIEW" | "CLIENT_REVIEW" | "READY_FOR_RELEASE" | "DONE";

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "NEW_REQUEST", label: "New Request", color: "bg-zinc-500" },
  { id: "CLARIFICATION", label: "Clarification", color: "bg-violet-500" },
  { id: "READY_FOR_DEV", label: "Ready for Dev", color: "bg-blue-500" },
  { id: "IN_DEVELOPMENT", label: "In Development", color: "bg-sky-500" },
  { id: "INTERNAL_REVIEW", label: "Internal Review", color: "bg-amber-500" },
  { id: "CLIENT_REVIEW", label: "Client Review", color: "bg-orange-500" },
  { id: "READY_FOR_RELEASE", label: "Ready for Release", color: "bg-teal-500" },
  { id: "DONE", label: "Done", color: "bg-emerald-500" },
];

interface QuestionWithType extends TaskQuestion {
  taskType: string;
}

interface TaskData {
  id: string;
  taskNumber: number;
  title: string;
  description: string | null;
  priority: number | null;
  taskType: string;
  stage: string;
  order: number;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
  createdAt: string;
  estimatedMinutes?: number | null;
  estimateAccuracy?: string | null;
}

interface StageLogData {
  startedAt: Date | null;
  logs: { stage: string; enteredAt: Date; exitedAt: Date | null }[];
}

interface NoteData {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  author: { name: string | null };
}

interface Props {
  task: TaskData;
  projectId: string;
  projectName: string;
  questions: QuestionWithType[];
  initialAnswers: Record<string, string>;
  stageLogData: StageLogData;
  initialNotes: NoteData[];
  isAdmin: boolean;
}

export function TaskDetailPage({
  task: initialTask,
  projectId,
  projectName,
  questions: allQuestions,
  initialAnswers,
  stageLogData,
  initialNotes,
  isAdmin,
}: Props) {
  const router = useRouter();
  const questions = allQuestions.filter((q) => q.taskType === initialTask.taskType);
  const taskTypeMeta = TASK_TYPE_META[initialTask.taskType] ?? TASK_TYPE_META.FEATURE;

  // Task state (mutable for title, priority, stage)
  const [taskStage, setTaskStage] = useState<Stage>(initialTask.stage as Stage);
  const [titleValue, setTitleValue] = useState(initialTask.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [priorityValue, setPriorityValue] = useState<number | null>(initialTask.priority);

  // Questions
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const answersRef = useRef<Record<string, string>>(initialAnswers);
  const [savingAnswers, setSavingAnswers] = useState<Record<string, "saving" | "saved">>({});
  const [editingAnswers, setEditingAnswers] = useState<Record<string, boolean>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Stage movement
  const [movingStage, setMovingStage] = useState(false);
  const [moveError, setMoveError] = useState<string[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineComment, setDeclineComment] = useState("");
  const [declining, setDeclining] = useState(false);

  // Sections
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [activityKey, setActivityKey] = useState(0);
  const [timeTrackingOpen, setTimeTrackingOpen] = useState(false);

  // Notes
  const [notes, setNotes] = useState<NoteData[]>(initialNotes);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);

  // Time tracking
  const startedAt = stageLogData.startedAt ? new Date(stageLogData.startedAt).toISOString() : null;
  const stageLogs = stageLogData.logs.map((l) => ({
    stage: l.stage,
    enteredAt: new Date(l.enteredAt).toISOString(),
    exitedAt: l.exitedAt ? new Date(l.exitedAt).toISOString() : null,
  }));

  const currentStageIndex = STAGES.findIndex((s) => s.id === taskStage);
  const nextStage = currentStageIndex < STAGES.length - 1 ? STAGES[currentStageIndex + 1] : null;
  const clarificationIndex = STAGES.findIndex((s) => s.id === "CLARIFICATION");
  const isPostClarification = currentStageIndex > clarificationIndex;

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  async function handleTitleSave() {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === initialTask.title) {
      setTitleValue(initialTask.title);
      return;
    }
    try {
      await updateTask({ taskId: initialTask.id, title: trimmed });
      setActivityKey((k) => k + 1);
    } catch {
      setTitleValue(initialTask.title);
    }
  }

  async function handlePrioritySave(newPriority: number | null) {
    const oldPriority = priorityValue;
    setPriorityValue(newPriority);
    if (newPriority === initialTask.priority) return;
    try {
      await updateTask({ taskId: initialTask.id, priority: newPriority });
      setActivityKey((k) => k + 1);
    } catch {
      setPriorityValue(oldPriority);
    }
  }

  function handleAnswerChange(questionId: string, value: string) {
    const updated = { ...answersRef.current, [questionId]: value };
    setAnswers(updated);
    answersRef.current = updated;
    setEditingAnswers((prev) => ({ ...prev, [questionId]: true }));
    debouncedSaveAnswer(questionId, value);
  }

  function debouncedSaveAnswer(questionId: string, value: string) {
    if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(async () => {
      setSavingAnswers((prev) => ({ ...prev, [questionId]: "saving" }));
      try {
        await saveTaskAnswers({ taskId: initialTask.id, answers: [{ questionId, answer: value }] });
        setSavingAnswers((prev) => ({ ...prev, [questionId]: "saved" }));
        setMoveError(null);
        setActivityKey((k) => k + 1);
        setTimeout(() => setSavingAnswers((prev) => { const next = { ...prev }; delete next[questionId]; return next; }), 1500);
      } catch {
        setSavingAnswers((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
      }
    }, 800);
  }

  function handleMoveToNext() {
    if (!nextStage || movingStage) return;
    const checkpoint = getCheckpoint(taskStage, nextStage.id);
    if (checkpoint) { setShowConfirm(true); return; }
    executeMove();
  }

  async function executeMove(estimatedMinutes?: number) {
    if (!nextStage) return;
    setMovingStage(true);
    setMoveError(null);
    setShowConfirm(false);
    try {
      await moveTaskAction({ taskId: initialTask.id, stage: nextStage.id, order: initialTask.order, estimatedMinutes });
      setTaskStage(nextStage.id);
      setActivityKey((k) => k + 1);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("REQUIRED_QUESTIONS:")) {
        try { setMoveError(JSON.parse(msg.replace("REQUIRED_QUESTIONS:", ""))); setQuestionsOpen(true); }
        catch { setMoveError(["Some required questions are unanswered"]); }
      } else if (msg.startsWith("PRIORITY_BLOCKED:")) {
        try { setMoveError(["Higher priority tasks must move first:", ...JSON.parse(msg.replace("PRIORITY_BLOCKED:", ""))]); }
        catch { setMoveError(["Higher priority tasks must be completed first"]); }
      } else if (msg === "ESTIMATE_REQUIRED") {
        setMoveError(["An estimated time is required"]);
      } else {
        setMoveError([msg || "Failed to move task. Please try again."]);
      }
    } finally {
      setMovingStage(false);
    }
  }

  const canDecline = taskStage === "INTERNAL_REVIEW" || taskStage === "CLIENT_REVIEW";
  const declineTargetStage = taskStage === "CLIENT_REVIEW" ? "INTERNAL_REVIEW" : "IN_DEVELOPMENT";
  const declineTargetLabel = taskStage === "CLIENT_REVIEW" ? "Internal Review" : "In Development";

  async function handleDecline() {
    if (!declineComment.trim() || declining) return;
    setDeclining(true);
    try {
      await declineTask({ taskId: initialTask.id, comment: declineComment.trim() });
      setTaskStage(declineTargetStage as Stage);
      setActivityKey((k) => k + 1);
      setShowDecline(false);
      setDeclineComment("");
    } catch (err) {
      console.error(err);
    } finally {
      setDeclining(false);
    }
  }

  async function refreshNotes() {
    const data = await getTaskNotes(initialTask.id);
    setNotes(data);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="h-12 flex items-center gap-3 px-6 pr-14 border-b border-border shrink-0 sticky top-0 bg-background z-10">
        <button
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-muted-foreground font-mono truncate">{projectName}</span>
          <span className="text-[11px] text-muted-foreground/40">/</span>
          <span className={cn("text-[11px] font-semibold", taskTypeMeta.color)}>
            {taskTypeMeta.prefix}-{String(initialTask.taskNumber).padStart(3, "0")}
          </span>
        </div>
      </div>

      {/* Single-column layout */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Title */}
        <div>
          {editingTitle && !isPostClarification ? (
            <input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") { setTitleValue(initialTask.title); setEditingTitle(false); }
              }}
              className="text-2xl font-bold bg-transparent border-b border-primary outline-none w-full"
            />
          ) : (
            <h1
              className={cn("text-2xl font-bold", !isPostClarification && "cursor-text hover:text-primary/80 transition-colors")}
              onClick={() => !isPostClarification && setEditingTitle(true)}
            >
              {titleValue}
            </h1>
          )}
          {initialTask.description && (
            <p className="text-[13px] text-muted-foreground leading-relaxed mt-2">
              {initialTask.description}
            </p>
          )}
        </div>

        {/* Type, Priority, Assigned To, Created By */}
        <div className="rounded-xl bg-card border border-border p-5 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="text-[13px] font-semibold text-foreground mb-2 block">Type</label>
              <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium", taskTypeMeta.color,
                taskTypeMeta.color === "text-primary" ? "bg-primary/15 border-primary/20"
                : taskTypeMeta.color === "text-violet-400" ? "bg-violet-500/15 border-violet-500/20"
                : taskTypeMeta.color === "text-amber-400" ? "bg-amber-500/15 border-amber-500/20"
                : taskTypeMeta.color === "text-destructive" ? "bg-destructive/15 border-destructive/20"
                : "bg-cyan-500/15 border-cyan-500/20"
              )}>{taskTypeMeta.label}</span>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-foreground mb-2 block">Created By</label>
              <div className="flex items-center gap-2">
                {initialTask.createdBy.imageUrl ? (
                  <img src={initialTask.createdBy.imageUrl} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                    {(initialTask.createdBy.name ?? "?")[0]}
                  </div>
                )}
                <span className="text-[13px] text-foreground">{initialTask.createdBy.name ?? "Unknown"}</span>
              </div>
            </div>
          </div>

          {initialTask.assignee && (
            <div>
              <label className="text-[13px] font-semibold text-foreground mb-2 block">Assigned To</label>
              <div className="flex items-center gap-2">
                {initialTask.assignee.imageUrl ? (
                  <img src={initialTask.assignee.imageUrl} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                    {(initialTask.assignee.name ?? "?")[0]}
                  </div>
                )}
                <span className="text-[13px] text-foreground">{initialTask.assignee.name ?? "Unknown"}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-[13px] font-semibold text-foreground mb-2 block">Priority</label>
            {isPostClarification ? (
              priorityValue != null ? (
                <span className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-[12px] font-semibold",
                  priorityValue >= 9 ? "bg-destructive/20 border-destructive/40 text-destructive"
                    : priorityValue >= 7 ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                    : priorityValue >= 4 ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-muted border-border text-foreground"
                )}>P{priorityValue}</span>
              ) : <span className="text-[12px] text-muted-foreground/50">No priority</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => handlePrioritySave(null)}
                  className={cn("h-8 rounded-md border px-3 text-[12px] font-medium transition-colors",
                    priorityValue == null ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  )}>None</button>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button key={n} type="button" onClick={() => handlePrioritySave(n)}
                    className={cn("h-8 w-8 rounded-md border text-[12px] font-medium transition-colors",
                      priorityValue === n
                        ? n >= 9 ? "bg-destructive/20 border-destructive/40 text-destructive"
                          : n >= 7 ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                          : n >= 4 ? "bg-primary/20 border-primary/40 text-primary"
                          : "bg-muted border-primary/40 text-foreground"
                        : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    )}>{n}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="rounded-xl bg-card border border-border p-5">
          <label className="text-[13px] font-semibold text-foreground mb-3 block">Status</label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-primary/15 border-primary/20 text-primary">
              <span className={cn("w-2 h-2 rounded-full", STAGES[currentStageIndex]?.color)} />
              {STAGES[currentStageIndex]?.label}
            </span>
            {nextStage && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                <button
                  onClick={handleMoveToNext}
                  disabled={movingStage}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
                >
                  {movingStage ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <span className={cn("w-2 h-2 rounded-full", nextStage.color)} />
                      {nextStage.label}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
          {canDecline && (
            <div className="mt-3">
              {!showDecline ? (
                <button
                  onClick={() => setShowDecline(true)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-destructive/70 hover:text-destructive transition-colors"
                >
                  <Undo2 className="w-3 h-3" />
                  Decline &amp; return to {declineTargetLabel}
                </button>
              ) : (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2.5 mt-2">
                  <p className="text-[11px] font-medium text-destructive">Why is this being declined?</p>
                  <textarea
                    value={declineComment}
                    onChange={(e) => setDeclineComment(e.target.value)}
                    placeholder="Explain what needs to be fixed..."
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-destructive/50 resize-none"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="destructive" onClick={handleDecline} disabled={!declineComment.trim() || declining} className="h-7 text-[11px]">
                      {declining ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Undo2 className="w-3 h-3 mr-1" />}
                      Decline
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowDecline(false); setDeclineComment(""); }} className="h-7 text-[11px]">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {moveError && (
            <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-[11px] font-medium text-destructive mb-1">Answer these required questions first:</p>
              <ul className="space-y-0.5">
                {moveError.map((q, i) => (
                  <li key={i} className="text-[11px] text-destructive/80">• {q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Questions */}
        {questions.length > 0 && (
          <div className="rounded-xl bg-card border border-border p-5">
            <button onClick={() => setQuestionsOpen((v) => !v)} className="flex items-center gap-2 w-full text-left">
              <MessageCircleQuestion className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-[13px] font-semibold flex-1">Questions</h3>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", questionsOpen && "rotate-180")} />
            </button>
            {questionsOpen && (
              <div className="space-y-5 mt-4">
                {questions.map((q, i) => {
                  const currentVal = answers[q.id] ?? "";
                  const hasAnswer = !!currentVal.trim();
                  const explicitlyEditing = editingAnswers[q.id] ?? false;
                  const isEditing = explicitlyEditing || !hasAnswer;
                  const saveState = savingAnswers[q.id];
                  return (
                    <div key={q.id} className="relative group">
                      <QuestionField
                        question={q}
                        index={i}
                        value={answers[q.id] ?? ""}
                        readonly={isPostClarification || !isEditing}
                        showRequiredAs="transition"
                        onChange={(val) => handleAnswerChange(q.id, val)}
                      />
                      {!isPostClarification && (
                        <div className="absolute top-0 right-0 flex items-center gap-1">
                          {saveState === "saving" && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                          {saveState === "saved" && <Check className="w-3 h-3 text-emerald-400" />}
                          {hasAnswer && !isEditing && (
                            <button
                              onClick={() => setEditingAnswers((prev) => ({ ...prev, [q.id]: true }))}
                              className="p-1 rounded-md text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Time Tracking */}
        <div className="rounded-xl bg-card border border-border p-5">
          <button onClick={() => setTimeTrackingOpen(!timeTrackingOpen)} className="flex items-center gap-2 w-full text-left">
            <Clock className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-[13px] font-semibold flex-1">Time Tracking</h3>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", timeTrackingOpen && "rotate-180")} />
          </button>
          {timeTrackingOpen && (
            <div className="mt-4 space-y-3">
              {startedAt && stageLogs.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Total time
                    </span>
                    <span className="text-[14px] font-semibold font-mono tabular-nums">
                      {formatDuration(new Date(startedAt), new Date())}
                    </span>
                  </div>
                  <div className="border-t border-border/30 pt-3 space-y-2">
                    {stageLogs
                      .filter((l) => l.stage !== "NEW_REQUEST" && l.stage !== "CLARIFICATION")
                      .map((log, i) => {
                        const entered = new Date(log.enteredAt);
                        const exited = log.exitedAt ? new Date(log.exitedAt) : new Date();
                        const stageInfo = STAGES.find((s) => s.id === log.stage);
                        return (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                              <span className={cn("w-2 h-2 rounded-full", stageInfo?.color ?? "bg-zinc-500")} />
                              {stageInfo?.label ?? log.stage}
                              {!log.exitedAt && <span className="text-[10px] text-primary ml-1">(current)</span>}
                            </span>
                            <span className="text-[12px] font-mono tabular-nums text-muted-foreground">
                              {formatDuration(entered, exited)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <Clock className="w-6 h-6 text-muted-foreground/30 mb-1" />
                  <p className="text-[11px] text-muted-foreground/60">Tracking starts at Ready for Dev</p>
                </div>
              )}
              {(initialTask.estimatedMinutes || initialTask.estimateAccuracy) && (
                <div className="border-t border-border/30 pt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {initialTask.estimatedMinutes && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2.5 py-1 text-[12px] font-semibold text-foreground">
                        <Timer className="w-3 h-3 text-muted-foreground" /> Est: {formatEstimate(initialTask.estimatedMinutes)}
                      </span>
                    )}
                    {initialTask.estimateAccuracy && ACCURACY_CONFIG[initialTask.estimateAccuracy] && (
                      <span className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-semibold", ACCURACY_CONFIG[initialTask.estimateAccuracy].bg, ACCURACY_CONFIG[initialTask.estimateAccuracy].color)}>
                        <Gauge className="w-3 h-3" /> {ACCURACY_CONFIG[initialTask.estimateAccuracy].label}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-[13px] font-semibold">Notes</h3>
              {notes.length > 0 && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                  {notes.length}
                </span>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNoteEditorOpen(true)} className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              New
            </Button>
          </div>
          {notes.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/60 py-2">No notes attached</p>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => router.push(`/dashboard/projects/${projectId}?tab=notes&noteId=${note.id}`)}
                  className="w-full text-left rounded-lg border border-border/60 bg-background p-3 hover:border-border transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-medium text-primary truncate">{note.title}</p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                      {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">by {note.author.name ?? "Unknown"}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-[13px] font-semibold">Comments</h3>
          </div>
          <CommentSection taskId={initialTask.id} projectId={projectId} />
        </div>

        {/* Activity */}
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-[13px] font-semibold">Activity</h3>
          </div>
          <ActivityTimeline taskId={initialTask.id} refreshKey={activityKey} />
        </div>
      </div>

      {/* Stage confirm dialog */}
      {showConfirm && nextStage && (() => {
        const checkpoint = getCheckpoint(taskStage, nextStage.id);
        return checkpoint ? (
          <StageConfirmDialog
            checkpoint={checkpoint}
            onConfirm={(estimatedMinutes) => executeMove(estimatedMinutes)}
            onCancel={() => setShowConfirm(false)}
          />
        ) : null;
      })()}

      {/* Note editor (full-screen) */}
      {noteEditorOpen && (
        <TaskNoteEditor
          task={initialTask}
          projectId={projectId}
          taskTypeMeta={taskTypeMeta}
          onClose={() => setNoteEditorOpen(false)}
          onSaved={() => { setNoteEditorOpen(false); refreshNotes(); }}
        />
      )}
    </div>
  );
}

function TaskNoteEditor({
  task,
  projectId,
  taskTypeMeta,
  onClose,
  onSaved,
}: {
  task: TaskData;
  projectId: string;
  taskTypeMeta: { prefix: string; label: string; color: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const noteType = task.taskType as "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
      await createMeetingNote({
        projectId,
        title: title.trim(),
        content,
        date: new Date().toISOString().split("T")[0],
        noteType,
        taskId: task.id,
      });
      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-[11px] text-muted-foreground/50">|</span>
          <span className={`text-[12px] font-medium ${taskTypeMeta.color}`}>
            {taskTypeMeta.prefix}-{String(task.taskNumber).padStart(3, "0")}
          </span>
          <span className="text-[12px] text-muted-foreground truncate max-w-[200px]">{task.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving..." : "Save Note"}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 sm:px-16 py-10">
          <div className="mb-6">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${taskTypeMeta.color} bg-muted/50 border-border`}>
              {taskTypeMeta.label} Note
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-8"
            autoFocus
          />
          <RichTextEditor content={content} onChange={setContent} placeholder="Write your note... (type / for commands)" borderless />
        </div>
      </div>
    </div>
  );
}
