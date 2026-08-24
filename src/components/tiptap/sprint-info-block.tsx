"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { CheckCircle2, Play } from "lucide-react";
import { completeSprint, getSprintPlanningTasks, getSprintReviewTasks, startSprint, updateSprint } from "@/actions/sprint";
import { Button } from "@/components/ui/button";
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
import { countWorkingDays, endDateForWorkingDays } from "@/lib/working-days";
import { useChannel } from "@/components/realtime/hooks";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { projectChannel } from "@/lib/channels";

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
      const liveById = new Map(tasksRef.current.map((task) => [task.id, task]));
      editor.state.doc.descendants((node) => {
        if (node.type.name !== "sprintTask") return;
        const task = node.attrs.task as SprintPlanningTask | null;
        if (!task?.id) return;
        const live = liveById.get(task.id);
        if (review) {
          if (node.attrs.variant === "incomplete") {
            incomplete += 1;
            if (!String(node.attrs.incompleteReason ?? "").trim()) missing = true;
          } else if (node.attrs.variant === "completed") {
            completed += 1;
          }
          if (task.unplanned || live?.unplanned) unplanned += 1;
          return;
        }
        if (!String(node.attrs.decision ?? "").trim()) missing = true;
        if (!String(node.attrs.risk ?? "").trim()) missing = true;
        if (!(task.estimatedMinutes || live?.estimatedMinutes)) missingEst = true;
        if (!(task.assignee || live?.assignee)) missingAsg = true;
      });
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
  const startBlockedReason = !canStart
    ? null
    : sprintStartBlockedReason({
        activeSprintName,
        infoIncomplete,
        missingEstimates,
        missingAssignees,
        docIncomplete,
      });
  const startBlocked = Boolean(startBlockedReason);
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
      const reason = sprintStartBlockedReason({
        activeSprintName: data.activeSprintName,
        infoIncomplete,
        missingEstimates: data.tasks.some((task) => !task.estimatedMinutes),
        missingAssignees: data.tasks.some((task) => !task.assignee),
        docIncomplete: (() => {
          let missingRequired = false;
          editor.state.doc.descendants((node) => {
            if (node.type.name !== "sprintTask") return;
            const task = node.attrs.task as SprintPlanningTask | null;
            if (!task?.id) return;
            const decision = String(node.attrs.decision ?? "").trim();
            const risk = String(node.attrs.risk ?? "").trim();
            if (!decision || !risk) missingRequired = true;
          });
          return missingRequired;
        })(),
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
              stage: "NEW_REQUEST",
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
            (task.stage === "NEW_REQUEST" || task.stage === "CLARIFICATION")
          ) {
            updateTask(task.id, { stage: "READY_FOR_DEV" });
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
        <div className="mb-8 space-y-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void requestStart()}
            disabled={starting || startBlocked}
            title={startBlockedReason ?? "Start sprint"}
          >
            <Play className="size-3.5" />
            {starting ? "Starting…" : "Start sprint"}
          </Button>
          {startBlockedReason ? (
            <p className="text-s text-muted-foreground">{startBlockedReason}</p>
          ) : null}
        </div>
      ) : null}
      {canEnd ? (
        <div className="mb-8">
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
        </div>
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
      {error ? <p className="mt-4 text-s text-destructive">{error}</p> : null}
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

export const SprintInfoBlock = Node.create<{
  projectId?: string;
  isAdmin?: boolean;
  getIsAdmin?: () => boolean;
  canStartSprint?: boolean;
  getCanStartSprint?: () => boolean;
  canEndSprint?: boolean;
  getCanEndSprint?: () => boolean;
  onSprintStatusChange?: (status: string) => void;
}>({
  name: "sprintInfo",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  addOptions() {
    return {
      projectId: undefined,
      isAdmin: false,
      getIsAdmin: undefined,
      canStartSprint: false,
      getCanStartSprint: undefined,
      canEndSprint: false,
      getCanEndSprint: undefined,
      onSprintStatusChange: undefined,
    };
  },
  addAttributes() {
    return {
      info: {
        default: null as SprintPlanningInfo | null,
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-info") || "null") as SprintPlanningInfo | null;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => ({
          "data-info": JSON.stringify(attributes.info ?? null),
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="sprint-info"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "sprint-info",
        contenteditable: "false",
      }),
    ];
  },
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
