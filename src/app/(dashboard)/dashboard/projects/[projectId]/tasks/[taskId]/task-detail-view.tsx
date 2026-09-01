"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddButton } from "@/components/add-button";
import {
  Loader2, MessageCircleQuestion, History, MessageSquare,
  ChevronRight, ChevronLeft, ChevronDown, Pencil, Check, Undo2,
  FileText, Paperclip, X, MoreVertical, Trash2, Zap, Info,
} from "lucide-react";
import { getTaskAnswers, saveTaskAnswers } from "@/actions/task-question";
import { updateTask, moveTask as moveTaskAction, declineTask, deleteTask, assignTaskToMe } from "@/actions/task";
import { getTaskNotes } from "@/actions/meeting-note";
import { AttachExistingNoteDialog } from "@/components/project/attach-existing-note-dialog";
import { TaskIssueNote } from "@/components/project/task-issue-note";
import { getNoteTypeConfig } from "@/components/project/note-types";
import { NoteCommentReplyDialog } from "@/components/messages/note-comment-reply-dialog";
import { formatDistanceToNow } from "date-fns";
import { QuestionField, questionShowsRequiredStar, type TaskQuestion } from "@/components/kanban/question-field";
import { CommentSection } from "@/components/kanban/comment-section";
import { StageConfirmDialog, getCheckpoint } from "@/components/kanban/stage-confirm-dialog";
import { ProofOfWorkDialog } from "@/components/kanban/proof-of-work-dialog";
import { ProofVideosSection } from "@/components/kanban/proof-videos-section";
import { TaskHistoryDialog } from "@/components/kanban/task-history-dialog";
import { TaskLifecycleTimeline } from "@/components/task/task-lifecycle-timeline";
import type { StageVisit, TaskHistoryActivity, TaskHistorySummary } from "@/actions/task-history";
import { needsProofOfWork } from "@/lib/proof-of-work";
import { useKanbanStore, type MovableStage } from "@/store/kanban";
import { DeclineDialog } from "@/components/kanban/decline-dialog";
import { projectNoteUrl, isRoadmapNote } from "@/lib/project-note-url";
import { cn } from "@/lib/utils";
import {
  isTaskPriority,
  projectHrefForTaskReturn,
  sprintTabForStatus,
  taskStageBadge,
  TASK_PRIORITIES,
  TASK_PRIORITY_BADGE,
  type TaskPriorityId,
} from "@/lib/task-label";
import { EstimateBadge, TaskTypeBadge } from "@/components/project/sprint-task-row";
import { SprintStatusControl } from "@/components/project/sprint-status-control";
import { StatusBadge } from "@/components/ui/status-badge";
import { CountBadge } from "@/components/ui/count-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { PageHeader, PageBackButton } from "@/components/page-header";
import { PageHeaderActions } from "@/components/page-header-actions";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SprintDocHeaderLeft } from "@/components/project/note-slide-over";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { uploadFileToR2 } from "@/lib/upload";
import { usePasteFiles } from "@/hooks/use-paste-files";
import { markThreadRead } from "@/actions/messages";
import { closePushBannersByTags } from "@/lib/close-push-banners";
import { threadPushTag } from "@/lib/notification-read";
import { updateAppBadge } from "@/lib/app-badge";
import { computeIsReadyForTransition } from "@/lib/task-readiness";
import { syncTaskReadiness } from "@/lib/backlog-placement";


const TASK_TYPE_META: Record<string, { prefix: string; label: string; color: string }> = {
  FEATURE: { prefix: "F", label: "Business Case", color: "text-primary" },
  ENHANCEMENT: { prefix: "E", label: "Enhancement", color: "text-violet" },
  BUG: { prefix: "B", label: "Internal Bug", color: "text-orange" },
  REPORTED_BUG: { prefix: "RB", label: "Reported Bug", color: "text-destructive" },
  DESIGN: { prefix: "D", label: "Design", color: "text-cyan" },
};

// This page used to keep its own stage list, which had drifted from the board's
// — it still offered Client Review after the board had dropped it. Both now read
// from the same place.
type Stage = MovableStage;

const STAGES: { id: Stage }[] = [
  { id: "BACKLOG" },
  { id: "TODO" },
  { id: "IN_DEVELOPMENT" },
  { id: "INTERNAL_REVIEW" },
  { id: "DONE" },
];

const ASSIGN_TO_ME_CHECKPOINT = {
  title: "Taking ownership",
  message: "By confirming, this task will be assigned to you and you take ownership of it.",
  confirmLabel: "Assign to Me",
  confirmColor: "bg-primary hover:bg-primary/90",
  assignToMe: true,
} as const;

interface QuestionWithType extends TaskQuestion {
  taskType: string;
}

interface TaskData {
  id: string;
  taskNumber: number;
  title: string;
  description: string | null;
  priority: TaskPriorityId;
  taskType: string;
  stage: string;
  order: number;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
  createdAt: string;
  estimatedMinutes?: number | null;
  estimateAccuracy?: string | null;
  sprints: {
    id: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    estimatedMinutes?: number | null;
  }[];
}

interface NoteData {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  noteType?: string;
  author: { name: string | null; imageUrl?: string | null };
}

interface Props {
  task: TaskData;
  projectId: string;
  projectName: string;
  questions: QuestionWithType[];
  initialAnswers: Record<string, string>;
  initialNotes: NoteData[];
  /** Null when the viewer's role cannot see the lifecycle. Omitted by the
   *  slide-over, which offers the history dialog instead. */
  history?: {
    visits: StageVisit[];
    activities: TaskHistoryActivity[];
    summary: TaskHistorySummary;
  } | null;
  isAdmin: boolean;
  canDelete?: boolean;
  initialThreadId?: string | null;
  backToNoteId?: string | null;
  backToTab?: string | null;
  embedded?: boolean;
  onClose?: () => void;
  initialNoteView?: boolean;
}

export function TaskDetailPage({
  task: initialTask,
  projectId,
  projectName,
  questions: allQuestions,
  initialAnswers,
  initialNotes,
  history = null,
  isAdmin,
  canDelete,
  initialThreadId = null,
  backToNoteId = null,
  backToTab = null,
  embedded = false,
  onClose,
  initialNoteView = false,
}: Props) {
  const router = useRouter();
  const questions = allQuestions.filter((q) => q.taskType === initialTask.taskType);
  const taskTypeMeta = TASK_TYPE_META[initialTask.taskType] ?? TASK_TYPE_META.FEATURE;
  const projectBackHref = backToNoteId
    ? projectNoteUrl(projectId, backToNoteId)
    : projectHrefForTaskReturn(
        projectId,
        backToTab,
        initialTask.sprints[0]?.status,
      );

  // Task state (mutable for title, priority, stage)
  const [taskStage, setTaskStage] = useState<Stage>(initialTask.stage as Stage);

  useEffect(() => {
    function onProofComplete(event: Event) {
      const detail = (event as CustomEvent<{ taskId?: string; stage?: Stage; order?: number }>).detail;
      if (detail?.taskId !== initialTask.id) return;
      const stage = detail.stage ?? "INTERNAL_REVIEW";
      setTaskStage(stage);
      useKanbanStore.getState().moveTask(initialTask.id, stage, detail.order ?? initialTask.order);
      setActivityKey((k) => k + 1);
    }
    window.addEventListener("proof-upload-complete", onProofComplete);
    return () => window.removeEventListener("proof-upload-complete", onProofComplete);
  }, [initialTask.id, initialTask.order]);
  const [titleValue, setTitleValue] = useState(initialTask.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const [priorityValue, setPriorityValue] = useState<TaskPriorityId>(initialTask.priority);

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
  const [showProof, setShowProof] = useState(false);
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [pendingDecline, setPendingDecline] = useState<{ taskId: string; fromStage: Stage; mentionName: string | null; mentionAvatar: string | null } | null>(null);
  const [showDecline, setShowDecline] = useState(false);
  const [declineComment, setDeclineComment] = useState("");
  const [declineFiles, setDeclineFiles] = useState<File[]>([]);
  const declineFileRef = useRef<HTMLInputElement>(null);
  const declinePasteRef = usePasteFiles(
    (files) => setDeclineFiles((prev) => [...prev, ...files]),
    { enabled: showDecline, capture: true },
  );
  const [declining, setDeclining] = useState(false);
  const [showAdminStages, setShowAdminStages] = useState(false);
  const adminStagesRef = useRef<HTMLDivElement>(null);

  // Sections
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [activityKey, setActivityKey] = useState(0);
  const [commentKey, setCommentKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  // Opening the task counts as reading its mention notifications — same
  // client-owned read path as chat (prefetch must never mark read).
  useEffect(() => {
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      const tag = threadPushTag({ taskId: initialTask.id, projectId });
      if (tag) void closePushBannersByTags([tag]);
      void markThreadRead({ taskId: initialTask.id, projectId })
        .then((counts) => {
          if (counts && typeof counts.unread === "number") {
            updateAppBadge(Math.max(0, counts.unread));
          }
        })
        .catch(() => {});
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [initialTask.id, projectId]);

  // Header actions menu
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);

  // Notes + roadmap (same NoteTaskLink; split by noteType)
  const [notes, setNotes] = useState<NoteData[]>(initialNotes);
  const [noteEditorOpen, setNoteEditorOpen] = useState(initialNoteView);
  const [viewingNote, setViewingNote] = useState<{ id: string; title: string } | null>(null);
  const [attachNoteOpen, setAttachNoteOpen] = useState(false);

  function taskPageHref(view?: "note") {
    const params = new URLSearchParams();
    if (initialThreadId) params.set("threadId", initialThreadId);
    if (backToNoteId) {
      params.set("from", "note");
      params.set("noteId", backToNoteId);
    } else if (backToTab) {
      params.set("from", backToTab);
    }
    if (view === "note") params.set("view", "note");
    const query = params.toString();
    return `/dashboard/projects/${projectId}/tasks/${initialTask.id}${query ? `?${query}` : ""}`;
  }

  function openNoteEditor() {
    if (embedded) {
      router.push(taskPageHref("note"));
      onClose?.();
      return;
    }
    setNoteEditorOpen(true);
    router.replace(taskPageHref("note"), { scroll: false });
  }

  function closeNoteEditor() {
    setNoteEditorOpen(false);
    router.replace(taskPageHref(), { scroll: false });
  }

  const currentStageIndex = STAGES.findIndex((s) => s.id === taskStage);
  const nextStage =
    currentStageIndex >= 0 && currentStageIndex < STAGES.length - 1
      ? STAGES[currentStageIndex + 1]
      : null;
  // Spec answers are only editable while the task is still in the backlog; once
  // it has been picked up, changing what was asked for rewrites history.
  const isPostClarification = taskStage !== "BACKLOG";
  const isReady = computeIsReadyForTransition(questions, answers);
  const missingData = taskStage === "BACKLOG" && !isReady;

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    const qs = allQuestions.filter((q) => q.taskType === initialTask.taskType);
    syncTaskReadiness(initialTask.id, computeIsReadyForTransition(qs, answersRef.current));
  }, [allQuestions, initialTask.id, initialTask.taskType]);

  useEffect(() => {
    if (!showAdminStages) return;
    function handleClick(e: MouseEvent) {
      if (adminStagesRef.current && !adminStagesRef.current.contains(e.target as Node)) {
        setShowAdminStages(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAdminStages]);

  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  async function handleDeleteTask() {
    if (deleting) return;
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setShowMenu(false);
    setDeleting(true);
    try {
      await deleteTask(initialTask.id);
      if (onClose) onClose();
      else router.push(`/dashboard/projects/${projectId}`);
    } catch (err) {
      alert((err as Error).message);
      setDeleting(false);
    }
  }

  async function handleAdminStageChange(stage: Stage) {
    if (stage === taskStage || movingStage) return;
    if (needsProofOfWork(taskStage, stage)) {
      setShowAdminStages(false);
      setShowProof(true);
      return;
    }
    setShowAdminStages(false);
    setMovingStage(true);
    setMoveError(null);
    try {
      const result = await moveTaskAction({ taskId: initialTask.id, stage, order: initialTask.order });
      if (!result.success) {
        setMoveError([result.error || "Failed to change stage"]);
        return;
      }
      setTaskStage(stage);
      setActivityKey((k) => k + 1);
    } catch (err: any) {
      setMoveError([err?.message ?? "Failed to change stage"]);
    } finally {
      setMovingStage(false);
    }
  }

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

  async function handlePrioritySave(newPriority: TaskPriorityId) {
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
    syncTaskReadiness(initialTask.id, computeIsReadyForTransition(questions, updated));
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
    if (needsProofOfWork(taskStage, nextStage.id)) {
      setShowProof(true);
      return;
    }
    const checkpoint = getCheckpoint(taskStage, nextStage.id, {
      missingEstimate: !(initialTask.estimatedMinutes != null && initialTask.estimatedMinutes > 0),
    });
    if (checkpoint) { setShowConfirm(true); return; }
    executeMove();
  }

  async function executeMove(estimatedMinutes?: number) {
    if (!nextStage) return;
    setMovingStage(true);
    setMoveError(null);
    setShowConfirm(false);
    try {
      const result = await moveTaskAction({ taskId: initialTask.id, stage: nextStage.id, order: initialTask.order, estimatedMinutes });
      if (!result.success) {
        const msg = result.error;
        if (msg.startsWith("REQUIRED_QUESTIONS:")) {
          try { setMoveError(JSON.parse(msg.replace("REQUIRED_QUESTIONS:", ""))); setQuestionsOpen(true); }
          catch { setMoveError(["Some required questions are unanswered"]); }
        } else if (msg.startsWith("PRIORITY_BLOCKED:")) {
          try { setMoveError(["Higher priority tasks must move first:", ...JSON.parse(msg.replace("PRIORITY_BLOCKED:", ""))]); }
          catch { setMoveError(["Higher priority tasks must be completed first"]); }
        } else if (msg === "ESTIMATE_REQUIRED") {
          setMoveError(["An estimated time is required"]);
        } else if (msg === "PROOF_REQUIRED") {
          setShowProof(true);
        } else {
          setMoveError([msg || "Failed to move task. Please try again."]);
        }
        return;
      }
      setTaskStage(nextStage.id);
      setActivityKey((k) => k + 1);
    } catch (err) {
      setMoveError([(err as Error).message || "Failed to move task. Please try again."]);
    } finally {
      setMovingStage(false);
    }
  }

  // "Skip client review" used to jump Internal Review straight to Done, past a
  // per-task client gate. That gate is gone — review happens once per sprint —
  // so Done is simply the next stage and the ordinary move button covers it.

  const canDecline = taskStage === "INTERNAL_REVIEW";
  const declineTargetStage = "IN_DEVELOPMENT" as const;
  const declineTargetLabel = "In Development";

  async function handleDecline() {
    if (!declineComment.trim() || declining) return;
    setDeclining(true);
    try {
      let attachments: { filename: string; url: string; fileSize: number; mimeType: string }[] | undefined;
      if (declineFiles.length > 0) {
        attachments = await Promise.all(
          declineFiles.map(async (file) => {
            const up = await uploadFileToR2(file);
            return { filename: file.name, url: up.url, fileSize: file.size, mimeType: file.type };
          })
        );
      }
      const result = await declineTask({ taskId: initialTask.id, comment: declineComment.trim(), attachments });
      if (!result.success) {
        alert(`Failed to decline task: ${result.error}`);
        return;
      }
      setTaskStage(declineTargetStage as Stage);
      setActivityKey((k) => k + 1);
      setCommentKey((k) => k + 1);
      setShowDecline(false);
      setDeclineComment("");
      setDeclineFiles([]);
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

  const attachedNotes = notes.filter((n) => !isRoadmapNote(n.noteType));

  const viewSwitchButton = (
    <Button
      type="button"
      size="sm"
      onClick={() => (noteEditorOpen ? closeNoteEditor() : openNoteEditor())}
    >
      {noteEditorOpen ? "Task details" : "Notes"}
    </Button>
  );

  const actionsMenu = (
    <div className={cn("relative", noteEditorOpen && "hidden")} ref={menuRef}>
      <button
        onClick={() => setShowMenu((v) => !v)}
        disabled={deleting}
        title="More actions"
        className="flex items-center justify-center rounded-md border border-border w-7 h-7 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
      </button>
      {showMenu && (
        <div className="absolute top-full right-0 mt-1.5 z-50 rounded-lg border border-border bg-card shadow-xl py-1 min-w-[160px]">
          <button
            onClick={() => {
              setShowMenu(false);
              setShowHistory(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-s font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-start"
          >
            <History className="w-3.5 h-3.5" />
            History
          </button>
          {canDelete && (
            <button
              onClick={handleDeleteTask}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-s font-medium text-destructive hover:bg-destructive/10 transition-colors text-start"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete task
            </button>
          )}
        </div>
      )}
    </div>
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      {viewSwitchButton}
      {actionsMenu}
    </div>
  );

  return (
    <div className={cn(!embedded && "min-h-screen")}>
      {!embedded ? (
        <>
          <PageHeaderActions>{viewSwitchButton}</PageHeaderActions>
          <PageOverflowItems id="task-actions" order={0}>
            <DropdownMenuItem
              onClick={() => setShowHistory(true)}
            >
              <History className="h-4 w-4" />
              <span className="flex-1">History</span>
            </DropdownMenuItem>
            {canDelete ? (
              <DropdownMenuItem
                variant="destructive"
                disabled={deleting}
                onClick={() => void handleDeleteTask()}
              >
                <Trash2 className="h-4 w-4" />
                <span className="flex-1">Delete task</span>
              </DropdownMenuItem>
            ) : null}
          </PageOverflowItems>
        </>
      ) : null}
      {embedded ? (
        <SprintDocHeaderLeft>{headerActions}</SprintDocHeaderLeft>
      ) : (
      <PageHeader hasMenu>
        <PageBackButton
          onClick={() => {
            if (noteEditorOpen) {
              closeNoteEditor();
              return;
            }
            router.push(projectBackHref);
          }}
          label={
            noteEditorOpen
              ? "Back to task"
              : backToNoteId
                ? "Back to note"
                : "Back to project"
          }
        />
        <PageBreadcrumb
          items={[
            { label: "Projects", href: "/dashboard/projects" },
            {
              label: projectName,
              href: noteEditorOpen ? undefined : projectBackHref,
              onClick: noteEditorOpen
                ? () => closeNoteEditor()
                : undefined,
            },
            {
              label: `${taskTypeMeta.prefix}-${String(initialTask.taskNumber).padStart(3, "0")}`,
              className: taskTypeMeta.color,
              onClick: noteEditorOpen ? () => closeNoteEditor() : undefined,
            },
            ...(noteEditorOpen ? [{ label: "Note" }] : []),
          ]}
        />
      </PageHeader>
      )}

      {noteEditorOpen ? (
        <TaskIssueNote taskId={initialTask.id} fallbackTitle={titleValue} />
      ) : (
      <div className="mx-auto max-w-[54.6rem] px-app py-8 space-y-6">
        {/* Title */}
        <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
          <label className="text-s font-semibold text-foreground px-1 py-4 block">Title</label>
          <div className="group relative rounded-md border border-border bg-field px-3 py-3">
            {editingTitle && !isPostClarification ? (
              <textarea
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTitleSave(); }
                  if (e.key === "Escape") { setTitleValue(initialTask.title); setEditingTitle(false); }
                }}
                rows={1}
                className="text-m font-bold leading-normal bg-transparent outline-none w-full resize-none overflow-hidden break-words"
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
            ) : (
              <>
                <h1 className="text-m font-bold leading-normal break-words pe-8">{titleValue}</h1>
                {!isPostClarification && (
                  <button
                    onClick={() => setEditingTitle(true)}
                    className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
          <div className="flex items-center gap-2 px-1 py-4">
            <Info className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-s font-semibold">Details</h3>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between rounded-md border border-border bg-field px-3 py-3">
              <span className="text-s text-muted-foreground">Type</span>
              <span title={taskTypeMeta.label}>
                <TaskTypeBadge taskType={initialTask.taskType} />
              </span>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-field px-3 py-3">
              <span className="text-s text-muted-foreground">Assigned To</span>
              {initialTask.assignee ? (
                <button onClick={() => setShowAssignDialog(true)} className="cursor-pointer">
                  <Avatar size="sm" title={initialTask.assignee.name ?? "Unknown"}>
                    <AvatarImage src={initialTask.assignee.imageUrl ?? undefined} alt={initialTask.assignee.name ?? ""} />
                    <AvatarFallback>{(initialTask.assignee.name ?? "?")[0]}</AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <button onClick={() => setShowAssignDialog(true)} className="text-s text-muted-foreground/50 cursor-pointer hover:text-foreground transition-colors">
                  Unassigned
                </button>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-field px-3 py-3">
              <span className="text-s text-muted-foreground">Priority</span>
              <Select
                value={priorityValue}
                onValueChange={(val) => {
                  if (isTaskPriority(val)) handlePrioritySave(val);
                }}
              >
                <SelectTrigger className="h-8 w-auto min-w-[5rem] gap-1 rounded-lg border-border bg-transparent px-2.5 text-s">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((id) => (
                    <SelectItem key={id} value={id}>
                      {TASK_PRIORITY_BADGE[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-field px-3 py-3">
              <span className="text-s text-muted-foreground">Current Status</span>
              {isAdmin ? (
                <button
                  onClick={() => setShowStageDialog(true)}
                  disabled={movingStage}
                  className="cursor-pointer disabled:opacity-50"
                >
                  <StatusBadge
                    config={taskStageBadge(taskStage, missingData)}
                  />
                </button>
              ) : (
                <StatusBadge
                  config={taskStageBadge(taskStage, missingData)}
                />
              )}
            </div>

          </div>
        </div>

        {/* Sprints */}
        <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
          <div className="flex items-center gap-2 px-1 py-4">
            <Zap className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-s font-semibold">Sprints History</h3>
            {initialTask.sprints.length > 0 && (
              <CountBadge count={initialTask.sprints.length} size="sm" muted />
            )}
          </div>
          {initialTask.sprints.length === 0 ? (
            <p className="text-s text-muted-foreground/60 px-1 py-2">Not in a sprint</p>
          ) : (
            <div className="space-y-1">
              {initialTask.sprints.map((sprint) => (
                  <Link
                    key={sprint.id}
                    href={`/dashboard/projects/${projectId}?tab=${sprintTabForStatus(sprint.status)}`}
                    className="flex w-full items-center justify-between rounded-md border border-border bg-field px-3 py-3 hover:border-foreground/40 transition-colors"
                  >
                    <p className="text-s font-semibold text-foreground">{sprint.name}</p>
                    <div className="flex items-center gap-2">
                      <EstimateBadge minutes={sprint.estimatedMinutes} />
                      <SprintStatusControl status={sprint.status} endDate={sprint.endDate} />
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </div>


        {/* Questions */}
        {questions.length > 0 && (
          <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
            <button onClick={() => setQuestionsOpen((v) => !v)} className="flex items-center gap-2 w-full text-start px-1 py-4">
              <MessageCircleQuestion className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-s font-semibold flex-1">Questions</h3>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", questionsOpen && "rotate-180")} />
            </button>
            {questionsOpen && (
              <div className="space-y-3">
                {questions.map((q, i) => {
                  const currentVal = answers[q.id] ?? "";
                  const hasAnswer = !!currentVal.trim();
                  const explicitlyEditing = editingAnswers[q.id] ?? false;
                  const isEditing = explicitlyEditing || !hasAnswer;
                  const saveState = savingAnswers[q.id];
                  return (
                    <div key={q.id} className="relative group space-y-1.5">
                      <label className="text-s font-medium text-muted-foreground px-1">
                        {i + 1}. {q.question}
                        {questionShowsRequiredStar(q, "backlog") && (
                          <span className="text-destructive ms-0.5">*</span>
                        )}
                      </label>
                      <div className="relative rounded-md border border-border bg-field px-3 py-3">
                        {!isPostClarification && (
                          <div className="absolute top-2 right-2 flex items-center gap-1">
                            {saveState === "saving" && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                            {saveState === "saved" && <Check className="w-3 h-3 text-success" />}
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
                        <QuestionField
                          question={q}
                          index={i}
                          value={answers[q.id] ?? ""}
                          readonly={isPostClarification || !isEditing}
                          showRequiredAs="backlog"
                          showLabel={false}
                          onChange={(val) => handleAnswerChange(q.id, val)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
          <div className="flex items-center justify-between px-1 py-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-s font-semibold">Notes</h3>
              {attachedNotes.length > 0 && (
                <CountBadge count={attachedNotes.length} size="sm" muted />
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setAttachNoteOpen(true)} className="h-7 w-7 p-0" title="Attach existing note">
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {attachedNotes.length === 0 ? (
            <p className="text-s text-muted-foreground/60 px-1 py-2">No notes attached</p>
          ) : (
            <div className="space-y-1">
              {attachedNotes.map((note) => {
                const cfg = getNoteTypeConfig(note.noteType);
                const TypeIcon = cfg.icon;
                const authorName = note.author.name ?? "Unknown";
                const authorInitial = authorName.charAt(0).toUpperCase();
                return (
                <button
                  key={note.id}
                  onClick={() => setViewingNote({ id: note.id, title: note.title })}
                  className="flex w-full items-center justify-between text-start rounded-md border border-border bg-field px-3 py-3 hover:border-foreground/40 transition-colors"
                >
                  <p className="text-s font-semibold text-foreground truncate">{note.title}</p>
                  <StatusBadge config={cfg} icon={TypeIcon} />
                </button>
                );
              })}
            </div>
          )}
        </div>

        <ProofVideosSection taskId={initialTask.id} taskStage={taskStage} />

        {/* Comments */}
        <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
          <div className="flex items-center gap-2 px-1 py-4">
            <MessageSquare className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-s font-semibold">Comments</h3>
          </div>
          <CommentSection key={`comments-${initialTask.id}-${commentKey}`} taskId={initialTask.id} projectId={projectId} />
        </div>

        {history && (
          <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
            <div className="flex items-center gap-2 px-1 py-4">
              <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-s font-semibold">Lifecycle</h3>
            </div>
            <TaskLifecycleTimeline
              visits={history.visits}
              activities={history.activities}
              summary={history.summary}
              dense
            />
          </div>
        )}
      </div>
      )}

      {showProof ? (
        <ProofOfWorkDialog
          target={{
            taskId: initialTask.id,
            taskTitle: initialTask.title,
            order: initialTask.order,
          }}
          projectId={projectId}
          onSubmitted={() => {
            setShowProof(false);
            setTaskStage("INTERNAL_REVIEW");
            useKanbanStore.getState().moveTask(initialTask.id, "INTERNAL_REVIEW", initialTask.order);
            setActivityKey((k) => k + 1);
          }}
          onCancel={() => setShowProof(false)}
        />
      ) : null}

      {/* Stage confirm dialog */}
      {showConfirm && nextStage && (() => {
        const checkpoint = getCheckpoint(taskStage, nextStage.id, {
          missingEstimate: !(initialTask.estimatedMinutes != null && initialTask.estimatedMinutes > 0),
        });
        return checkpoint ? (
          <StageConfirmDialog
            checkpoint={checkpoint}
            onConfirm={(estimatedMinutes) => executeMove(estimatedMinutes)}
            onCancel={() => setShowConfirm(false)}
          />
        ) : null;
      })()}

      {/* Task history popup */}
      {showHistory && (
        <TaskHistoryDialog
          taskId={initialTask.id}
          refreshKey={activityKey}
          onClose={() => setShowHistory(false)}
        />
      )}

      <NoteCommentReplyDialog
        open={Boolean(viewingNote)}
        onOpenChange={(open) => {
          if (!open) {
            setViewingNote(null);
            void refreshNotes();
          }
        }}
        noteId={viewingNote?.id ?? ""}
        noteTitle={viewingNote?.title ?? ""}
        projectId={projectId}
      />

      <AttachExistingNoteDialog
        open={attachNoteOpen}
        onClose={() => setAttachNoteOpen(false)}
        projectId={projectId}
        taskId={initialTask.id}
        kind="notes"
        onAttached={() => { refreshNotes(); setActivityKey((k) => k + 1); }}
      />

      <Dialog open={showStageDialog} onOpenChange={(open) => { if (!open) setShowStageDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move Task</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 text-s text-muted-foreground">
            Current status:
            <StatusBadge
              config={taskStageBadge(taskStage, missingData)}
            />
          </div>

          <div className="space-y-2">
            {nextStage && (
              <button
                onClick={() => { handleMoveToNext(); setShowStageDialog(false); }}
                disabled={movingStage}
                className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-s font-medium text-foreground hover:border-success/40 hover:bg-success/5 transition-colors disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4 text-success" />
                Move Forward
              </button>
            )}
            {canDecline && (
              <button
                onClick={() => { setShowStageDialog(false); setPendingDecline({ taskId: initialTask.id, fromStage: taskStage as Stage, mentionName: initialTask.assignee?.name ?? null, mentionAvatar: initialTask.assignee?.imageUrl ?? null }); }}
                className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-s font-medium text-foreground hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
              >
                <Undo2 className="w-4 h-4 text-destructive" />
                Decline
              </button>
            )}
          </div>

          {moveError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-xs font-medium text-destructive mb-1">Answer these required questions first:</p>
              <ul className="space-y-0.5">
                {moveError.map((q, i) => (
                  <li key={i} className="text-xs text-destructive/80">• {q}</li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pendingDecline && (
        <DeclineDialog
          fromStage={pendingDecline.fromStage}
          mentionName={pendingDecline.mentionName}
          mentionAvatar={pendingDecline.mentionAvatar}
          onConfirm={async (comment, attachments) => {
            await declineTask({ taskId: initialTask.id, comment, attachments });
            setTaskStage(declineTargetStage as Stage);
            setActivityKey((k) => k + 1);
            setCommentKey((k) => k + 1);
            setPendingDecline(null);
          }}
          onCancel={() => setPendingDecline(null)}
        />
      )}

      {showAssignDialog && (
        <StageConfirmDialog
          checkpoint={ASSIGN_TO_ME_CHECKPOINT}
          currentAssigneeName={initialTask.assignee?.name ?? null}
          currentAssigneeAvatar={initialTask.assignee?.imageUrl ?? null}
          onConfirm={() => {
            setShowAssignDialog(false);
            assignTaskToMe(initialTask.id).then(() => router.refresh());
          }}
          onCancel={() => setShowAssignDialog(false)}
        />
      )}
    </div>
  );
}
