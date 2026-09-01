"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Plugin } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { CheckCircle2, Play } from "lucide-react";
import { completeSprint, getSprintPlanningTasks, getSprintReviewTasks, startSprint, updateSprint } from "@/actions/sprint";
import { Button } from "@/components/ui/button";
import { SprintDocHeaderLeft } from "@/components/project/note-slide-over";
import { StartSprintDialog } from "@/components/project/start-sprint-dialog";
import { ConfirmCompleteSprintDialog } from "@/components/project/confirm-complete-sprint-dialog";
import { useKanbanStore } from "@/store/kanban";
import {
  formatPlanningDate,
  normalizeSprintPlanningInfo,
  sprintStartBlockedReason,
  type SprintPlanningInfo,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";
import { SprintInfoBlockSchema } from "@/lib/tiptap-schema";
import { countWorkingDays, endDateForWorkingDays } from "@/lib/working-days";
import { useChannel } from "@/components/realtime/hooks";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { projectChannel } from "@/lib/channels";

const DATE_RANGE_ERROR = "End date must be on or after the start date";

const cellInputClass =
  "w-full bg-transparent text-s text-foreground outline-none placeholder:text-muted-foreground/40 read-only:cursor-default disabled:cursor-default disabled:opacity-70";

function requiredLabel(label: string) {
  return (
    <span className="text-foreground">
      {label} <span className="text-destructive">*</span>
    </span>
  );
}

function fieldClass(empty: boolean) {
  return `${cellInputClass} ${empty ? "text-destructive" : ""}`;
}

function SprintInfoNodeView({ node, updateAttributes, editor, extension }: ReactNodeViewProps) {
  const info = normalizeSprintPlanningInfo(node.attrs.info as SprintPlanningInfo | null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(info?.status ?? "");
  const [sprintName, setSprintName] = useState(info?.sprintName ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endReasons, setEndReasons] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<SprintPlanningTask[]>([]);
  const [counts, setCounts] = useState({ completed: 0, incomplete: 0, unplanned: 0 });
  const [docIncomplete, setDocIncomplete] = useState(false);
  const [missingEstimates, setMissingEstimates] = useState(false);
  const [missingAssignees, setMissingAssignees] = useState(false);
  const [activeSprintName, setActiveSprintName] = useState<string | null>(null);
  const tasksRef = useRef<SprintPlanningTask[]>([]);
  const [, startTransition] = useTransition();
  const persistTimer = useRef<number | null>(null);
  const workingDaysTimer = useRef<number | null>(null);
  const editable = editor.isEditable;
  const sprintId = info?.sprintId ?? "";

  useEffect(() => {
    if (!sprintId) return;
    let cancelled = false;
    function load() {
      const review = info?.variant === "review";
      const request = review ? getSprintReviewTasks(sprintId) : getSprintPlanningTasks(sprintId);
      request
        .then((data) => {
          if (cancelled) return;
          setStatus(data.status);
          setSprintName(data.sprintName);
          if ("activeSprintName" in data) {
            setActiveSprintName(data.activeSprintName ?? null);
          }
          if ("tasks" in data) {
            setTasks(data.tasks);
            tasksRef.current = data.tasks;
            return;
          }
          const all = [...data.completed, ...data.incomplete];
          setTasks(all);
          tasksRef.current = all;
          setCounts({
            completed: data.completed.length,
            incomplete: data.incomplete.length,
            unplanned: all.filter((task) => task.unplanned).length,
          });
        })
        .catch(() => {});
    }
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [sprintId, info?.variant]);

  const cent = useCentrifugo();
  const projectIdOpt = (extension.options as { projectId?: string }).projectId;
  const loadRef = useRef<(() => void) | undefined>(undefined);
  loadRef.current = () => {
    if (!sprintId) return;
    const review = info?.variant === "review";
    const request = review ? getSprintReviewTasks(sprintId) : getSprintPlanningTasks(sprintId);
    request
      .then((data) => {
        setStatus(data.status);
        setSprintName(data.sprintName);
        if ("activeSprintName" in data) setActiveSprintName(data.activeSprintName ?? null);
        if ("tasks" in data) {
          setTasks(data.tasks);
          tasksRef.current = data.tasks;
          return;
        }
        const all = [...data.completed, ...data.incomplete];
        setTasks(all);
        tasksRef.current = all;
        setCounts({
          completed: data.completed.length,
          incomplete: data.incomplete.length,
          unplanned: all.filter((task) => task.unplanned).length,
        });
      })
      .catch(() => {});
  };

  useChannel(
    cent?.enabled && projectIdOpt ? projectChannel(projectIdOpt) : null,
    useCallback((data: unknown) => {
      const ev = data as { type?: string } | null;
      if (!ev?.type) return;
      if (ev.type.startsWith("sprint.") || ev.type === "task-updated") {
        loadRef.current?.();
      }
    }, []),
  );

  useEffect(() => {
    function scan() {
      let missing = false;
      let missingEst = false;
      let missingAsg = false;
      let completed = 0;
      let incomplete = 0;
      let unplanned = 0;
      const review = info?.variant === "review";

      // Index the document by task, then walk the sprint. Walking the document
      // instead meant a row left behind by a task that had moved on counted as
      // missing everything, which disabled Start sprint over work the sprint no
      // longer contained and gave no way to clear it.
      const nodeByTask = new Map<string, { attrs: Record<string, unknown> }>();
      editor.state.doc.descendants((node) => {
        if (node.type.name !== "sprintTask") return;
        const id =
          (node.attrs.id as string | null) ??
          (node.attrs.task as SprintPlanningTask | null)?.id ??
          null;
        if (id) nodeByTask.set(id, { attrs: node.attrs });
      });

      for (const live of tasksRef.current) {
        const attrs = nodeByTask.get(live.id)?.attrs;
        if (review) {
          const variant = attrs?.variant ?? (live.stage === "DONE" ? "completed" : "incomplete");
          if (variant === "incomplete") {
            incomplete += 1;
            if (!String(attrs?.incompleteReason ?? "").trim()) missing = true;
          } else if (variant === "completed") {
            completed += 1;
          }
          if (live.unplanned) unplanned += 1;
          continue;
        }
        // Decision and Risk are SprintTaskPlan rows; the node attribute is only
        // what has been typed since the last save, so either counts as filled.
        const decision = String(attrs?.decision ?? live.decision ?? "").trim();
        const risk = String(attrs?.risk ?? live.risk ?? "").trim();
        if (!decision || !risk) missing = true;
        if (!live.estimatedMinutes) missingEst = true;
        if (!live.assignee) missingAsg = true;
      }

      setDocIncomplete(missing);
      setMissingEstimates(missingEst);
      setMissingAssignees(missingAsg);
      if (review) setCounts({ completed, incomplete, unplanned });
    }
    scan();
    editor.on("update", scan);
    return () => {
      editor.off("update", scan);
    };
  }, [editor, info?.variant, tasks]);

  if (!info) return null;

  const isReview = info.variant === "review";
  const locked = Boolean(info.locked) || !editable || isReview;
  const sprintOpts = extension.options as {
    isAdmin?: boolean;
    getIsAdmin?: () => boolean;
    canStartSprint?: boolean;
    getCanStartSprint?: () => boolean;
    canEndSprint?: boolean;
    getCanEndSprint?: () => boolean;
  };
  const allowStart = sprintOpts.getCanStartSprint?.() ?? sprintOpts.canStartSprint ?? sprintOpts.getIsAdmin?.() ?? sprintOpts.isAdmin ?? false;
  const allowEnd = sprintOpts.getCanEndSprint?.() ?? sprintOpts.canEndSprint ?? sprintOpts.getIsAdmin?.() ?? sprintOpts.isAdmin ?? false;
  const canStart = allowStart && !isReview && Boolean(info.sprintId) && (status === "PLANNED" || status === "NEXT");
  const canEnd = allowEnd && isReview && Boolean(info.sprintId) && status === "ACTIVE";
  const documentDateEmpty = !info.documentDateIso;
  const startEmpty = !info.startIso;
  const endEmpty = !info.endIso;
  const workingDaysEmpty =
    info.workingDays === "" || info.workingDays == null || Number(info.workingDays) < 1;
  const infoIncomplete = documentDateEmpty || startEmpty || endEmpty || workingDaysEmpty;
  const datesInvalid = Boolean(info.startIso && info.endIso && info.endIso < info.startIso);
  const startBlockedReason = !canStart
    ? null
    : datesInvalid
      ? DATE_RANGE_ERROR
      : sprintStartBlockedReason({
          activeSprintName,
          infoIncomplete,
          missingEstimates,
          missingAssignees,
          docIncomplete,
        });
  const startBlocked = Boolean(startBlockedReason);
  const startButtonError = canStart
    ? (error ?? (datesInvalid ? DATE_RANGE_ERROR : null))
    : null;
  const endBlockedReason = !canEnd
    ? null
    : infoIncomplete
      ? "Fill in every Sprint Information field."
      : docIncomplete
        ? "Add a reason for every incomplete item."
        : null;
  const endBlocked = Boolean(endBlockedReason);

  function persistDates(startIso: string, endIso: string) {
    if (!info?.sprintId || info.locked) return;
    if (startIso && endIso && endIso < startIso) {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      return;
    }
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      startTransition(async () => {
        try {
          await updateSprint({ sprintId: info.sprintId, startDate: startIso, endDate: endIso });
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not update sprint");
        }
      });
    }, 250);
  }

  function applyDates(startIso: string, endIso: string) {
    const patch: Partial<SprintPlanningInfo> = {
      ...info,
      startIso,
      endIso,
      startDate: startIso ? formatPlanningDate(startIso) : "",
      endDate: endIso ? formatPlanningDate(endIso) : "",
    };
    if (startIso && endIso) {
      patch.workingDays = countWorkingDays(startIso, endIso);
      persistDates(startIso, endIso);
    }
    updateAttributes({ info: patch });
  }

  function setDocumentDate(iso: string) {
    updateAttributes({
      info: {
        ...info,
        documentDateIso: iso,
        documentDate: iso ? formatPlanningDate(iso) : "",
      },
    });
  }

  function handleWorkingDays(raw: string) {
    updateAttributes({
      info: { ...info, workingDays: raw === "" ? "" : raw },
    });
    const days = Number(raw);
    if (workingDaysTimer.current) window.clearTimeout(workingDaysTimer.current);
    if (!info?.startIso || !Number.isInteger(days) || days < 1) return;
    const startIso = info.startIso;
    workingDaysTimer.current = window.setTimeout(() => {
      applyDates(startIso, endDateForWorkingDays(startIso, days));
    }, 400);
  }

  async function requestStart() {
    if (!info?.sprintId) return;
    setError(null);
    setStarting(true);
    try {
      const data = await getSprintPlanningTasks(info.sprintId);
      setStatus(data.status);
      setSprintName(data.sprintName);
      setActiveSprintName(data.activeSprintName);
      setTasks(data.tasks);
      tasksRef.current = data.tasks;
      if (data.status !== "PLANNED" && data.status !== "NEXT") return;
      // Same source as the button's disabled state: the sprint's own task list,
      // with the document consulted only for text not yet saved. Walking the
      // document instead used to let the two disagree, so the button could be
      // enabled and then refuse, or refuse and name a task nobody could find.
      const nodeByTask = new Map<string, Record<string, unknown>>();
      editor.state.doc.descendants((node) => {
        if (node.type.name !== "sprintTask") return;
        const id =
          (node.attrs.id as string | null) ??
          (node.attrs.task as SprintPlanningTask | null)?.id ??
          null;
        if (id) nodeByTask.set(id, node.attrs);
      });
      const reason = sprintStartBlockedReason({
        activeSprintName: data.activeSprintName,
        infoIncomplete,
        missingEstimates: data.tasks.some((task) => !task.estimatedMinutes),
        missingAssignees: data.tasks.some((task) => !task.assignee),
        docIncomplete: data.tasks.some((task) => {
          const attrs = nodeByTask.get(task.id);
          const decision = String(attrs?.decision ?? task.decision ?? "").trim();
          const risk = String(attrs?.risk ?? task.risk ?? "").trim();
          return !decision || !risk;
        }),
      });
      if (reason) {
        setError(reason);
        return;
      }
      setConfirmOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start sprint");
    } finally {
      setStarting(false);
    }
  }

  function collectIncompleteReasons() {
    const reasons: Record<string, string> = {};
    let missing = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name !== "sprintTask") return;
      if (node.attrs.variant !== "incomplete") return;
      const task = node.attrs.task as { id?: string } | null;
      const reason = String(node.attrs.incompleteReason ?? "").trim();
      if (!reason) missing = true;
      if (task?.id && reason) reasons[task.id] = reason;
    });
    return { reasons, missing };
  }

  function requestEnd() {
    if (!info?.sprintId) return;
    setError(null);
    if (infoIncomplete) {
      setError("Fill in every Sprint Information field.");
      return;
    }
    const { reasons, missing } = collectIncompleteReasons();
    if (missing) {
      setError("Add a reason for every incomplete item.");
      return;
    }
    setEndReasons(reasons);
    setConfirmEndOpen(true);
  }

  function confirmEnd() {
    if (!info?.sprintId) return;
    const current = info;
    const sprintId = current.sprintId;
    setEnding(true);
    startTransition(async () => {
      try {
        const closed = await completeSprint(sprintId, endReasons);
        const updateTask = useKanbanStore.getState().updateTask;
        for (const task of useKanbanStore.getState().tasks) {
          if (task.sprintId === sprintId && task.stage !== "DONE") {
            updateTask(task.id, {
              sprintId: null,
              sprintName: null,
              estimatedMinutes: null,
              stage: "BACKLOG",
              assignee: null,
            });
          }
        }
        window.dispatchEvent(new CustomEvent("sprint-status-changed", { detail: closed }));
        updateAttributes({ info: { ...current, status: closed.status, locked: true } });
        setStatus(closed.status);
        setConfirmEndOpen(false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not end sprint");
      } finally {
        setEnding(false);
      }
    });
  }

  function confirmStart() {
    if (!info?.sprintId) return;
    const current = info;
    setStarting(true);
    startTransition(async () => {
      try {
        const started = await startSprint(current.sprintId);
        const updateTask = useKanbanStore.getState().updateTask;
        for (const task of useKanbanStore.getState().tasks) {
          if (
            task.sprintId === current.sprintId &&
            (task.stage === "BACKLOG" || task.stage === "PLANNED" || task.stage === "NEXT")
          ) {
            updateTask(task.id, { stage: "TODO" });
          }
        }
        window.dispatchEvent(new CustomEvent("sprint-status-changed", { detail: started }));
        updateAttributes({ info: { ...current, status: "ACTIVE" } });
        setStatus("ACTIVE");
        const options = extension.options as {
          isAdmin?: boolean;
          getIsAdmin?: () => boolean;
          onSprintStatusChange?: (status: string) => void;
        };
        options.onSprintStatusChange?.("ACTIVE");
        if (!(options.getIsAdmin?.() ?? options.isAdmin)) {
          editor.setEditable(false);
        }
        setConfirmOpen(false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start sprint");
      } finally {
        setStarting(false);
      }
    });
  }

  return (
    <NodeViewWrapper
      as="div"
      data-type="sprint-info"
      contentEditable={false}
      className="not-prose my-10"
    >
      {canStart ? (
        <SprintDocHeaderLeft>
          <div className="flex items-center gap-2">
            {startButtonError ? (
              <p className="max-w-[16rem] text-end text-xs leading-tight text-destructive">
                {startButtonError}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={activeSprintName || startButtonError ? "destructive" : "default"}
              onClick={() => void requestStart()}
              disabled={starting || startBlocked}
              title={startButtonError ?? startBlockedReason ?? "Start sprint"}
            >
              <Play className="size-3.5" />
              {starting ? "Starting…" : "Start sprint"}
            </Button>
          </div>
        </SprintDocHeaderLeft>
      ) : null}
      {canEnd ? (
        <SprintDocHeaderLeft>
          <Button
            type="button"
            size="sm"
            onClick={requestEnd}
            disabled={ending || endBlocked}
            title={endBlockedReason ?? "End sprint"}
          >
            <CheckCircle2 className="size-3.5" />
            {ending ? "Ending…" : "End sprint"}
          </Button>
        </SprintDocHeaderLeft>
      ) : null}
      <h2 className="mb-6 text-2xl font-semibold leading-snug text-foreground">
        Sprint Information
      </h2>
      <div className="w-full text-s">
        <div className="grid grid-cols-2 gap-x-8 border-b border-border py-3.5">
          {requiredLabel("Document Date")}
          <input
            type="date"
            required
            disabled={!editable}
            value={info.documentDateIso}
            onChange={(e) => setDocumentDate(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            className={fieldClass(documentDateEmpty)}
          />
        </div>

        <div className="grid grid-cols-2 gap-x-8 border-b border-border py-3.5">
          {requiredLabel("Sprint Start")}
          <input
            type="date"
            required
            disabled={locked}
            value={info.startIso}
            onChange={(e) => applyDates(e.target.value, info.endIso)}
            onMouseDown={(e) => e.stopPropagation()}
            className={fieldClass(startEmpty)}
          />
        </div>

        <div className="grid grid-cols-2 gap-x-8 border-b border-border py-3.5">
          {requiredLabel("Sprint End")}
          <input
            type="date"
            required
            disabled={locked}
            value={info.endIso}
            onChange={(e) => applyDates(info.startIso, e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            className={fieldClass(endEmpty)}
          />
        </div>

        <div className="grid grid-cols-2 gap-x-8 border-b border-border py-3.5">
          {requiredLabel("Total Working Days")}
          <input
            type="number"
            min={1}
            step={1}
            required
            inputMode="numeric"
            disabled={locked}
            value={info.workingDays === "" || info.workingDays == null ? "" : String(info.workingDays)}
            onChange={(e) => handleWorkingDays(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            className={fieldClass(workingDaysEmpty)}
          />
        </div>
        {isReview ? (
          <>
            <div className="grid grid-cols-2 gap-x-8 border-b border-border py-3.5">
              <span className="text-foreground">Number of completed tasks</span>
              <span className={cellInputClass}>{counts.completed}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 border-b border-border py-3.5">
              <span className="text-foreground">Number of uncompleted tasks</span>
              <span className={cellInputClass}>{counts.incomplete}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 border-b border-border py-3.5">
              <span className="text-foreground">Number of unplanned tasks</span>
              <span className={cellInputClass} title="Items added after the sprint started">
                {counts.unplanned}
              </span>
            </div>
          </>
        ) : null}
      </div>
      {error && !canStart ? (
        <p className="mt-4 text-s text-destructive">{error}</p>
      ) : null}
      <StartSprintDialog
        open={confirmOpen}
        sprintName={sprintName || "this sprint"}
        startDate={info.startIso}
        endDate={info.endIso}
        pending={starting}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmStart}
      />
      <ConfirmCompleteSprintDialog
        open={confirmEndOpen}
        sprintName={sprintName || "this sprint"}
        pending={ending}
        hasIncomplete={Object.keys(endReasons).length > 0}
        onOpenChange={setConfirmEndOpen}
        onConfirm={confirmEnd}
      />
    </NodeViewWrapper>
  );
}

function countSprintInfo(doc: { descendants: (fn: (node: { type: { name: string } }) => void) => void }) {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === "sprintInfo") count += 1;
  });
  return count;
}

export const SprintInfoBlock = SprintInfoBlockSchema.extend({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true;
          const before = countSprintInfo(state.doc);
          if (before === 0) return true;
          return countSprintInfo(tr.doc) >= 1;
        },
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SprintInfoNodeView);
  },
});
