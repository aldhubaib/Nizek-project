"use client";

import { useEffect, useRef } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { SprintTaskBlockSchema } from "@/lib/tiptap-schema";
import { EstimateBadge, SprintTaskRow } from "@/components/project/sprint-task-row";
import { PlanningAssigneePicker, PlanningEstimateInput } from "@/components/project/planning-task-controls";
import { updateSprintTaskPlan } from "@/actions/sprint";
import {
  formatPlanningAnswer,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";

/** Matches the other planning fields, which already autosave on a short pause. */
const PLAN_SAVE_DELAY_MS = 600;

function SprintTaskNodeView({ node, updateAttributes, editor, extension }: ReactNodeViewProps) {
  const task = node.attrs.task as SprintPlanningTask | null;
  const variant = (node.attrs.variant as string) || "planning";
  const isPlanning = variant === "planning";
  const isIncomplete = variant === "incomplete";
  const decision = String(node.attrs.decision ?? "");
  const risk = String(node.attrs.risk ?? "");
  const incompleteReason = String(node.attrs.incompleteReason ?? "");
  const options = extension.options as {
    projectId?: string;
    sprintId?: string;
    sprintTasks?: SprintPlanningTask[];
    hideAssignee?: boolean;
    onTasksPatched?: (taskId: string, patch: Partial<SprintPlanningTask>) => void;
  };
  const hideAssignee = Boolean(options.hideAssignee);
  const projectId = options.projectId;
  const liveTasks = options.sprintTasks ?? [];
  const live = task ? liveTasks.find((item) => item.id === task.id) : undefined;
  const editable = editor.isEditable;

  // Decision and Risk are rows in SprintTaskPlan; the node attributes are just
  // what is on screen between keystrokes. Saving is debounced and the pending
  // write is flushed on unmount so closing the document does not drop it.
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<{ decision?: string; risk?: string }>({});
  const saveCtx = useRef({ sprintId: options.sprintId, taskId: task?.id });
  saveCtx.current = { sprintId: options.sprintId, taskId: task?.id };

  function flushPlan() {
    const { sprintId, taskId } = saveCtx.current;
    const patch = pending.current;
    pending.current = {};
    if (!sprintId || !taskId || Object.keys(patch).length === 0) return;
    void updateSprintTaskPlan({ sprintId, taskId, ...patch }).catch(() => {});
  }

  function savePlan(patch: { decision?: string; risk?: string }) {
    pending.current = { ...pending.current, ...patch };
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushPlan, PLAN_SAVE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      flushPlan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const decisionEmpty = !decision.trim();
  const riskEmpty = !risk.trim();
  const reasonEmpty = !incompleteReason.trim();
  const canEditFields = editable && isPlanning;

  if (!task) return null;

  const questions = live?.questions?.length ? live.questions : task.questions ?? [];
  const rowTask = {
    ...task,
    estimatedMinutes: live ? live.estimatedMinutes : (task.estimatedMinutes ?? null),
    assignee: live ? live.assignee : (task.assignee ?? null),
  };

  function patchTask(patch: Partial<SprintPlanningTask>) {
    if (!task) return;
    const next = { ...task, ...patch };
    const nextLive = liveTasks.map((item) =>
      item.id === task.id ? { ...item, ...patch } : item,
    );
    extension.options.sprintTasks = nextLive;
    options.onTasksPatched?.(task.id, patch);
    updateAttributes({ task: next });
  }

  return (
    <NodeViewWrapper
      as="div"
      data-type="sprint-task"
      data-id={task.id}
      contentEditable={false}
      className="not-prose my-10 select-none"
    >
      <SprintTaskRow
        as="div"
        task={rowTask}
        missingData={false}
        hidePriority
        hideAssignee={hideAssignee}
        disableHoverBorder
        extra={
          canEditFields ? (
            <PlanningEstimateInput
              taskId={task.id}
              minutes={rowTask.estimatedMinutes}
              onSaved={(estimatedMinutes) => patchTask({ estimatedMinutes })}
            />
          ) : (
            <EstimateBadge minutes={rowTask.estimatedMinutes} />
          )
        }
        assigneeSlot={
          !hideAssignee && canEditFields && projectId ? (
            <PlanningAssigneePicker
              projectId={projectId}
              taskId={task.id}
              assignee={rowTask.assignee}
              onSaved={(assignee) => patchTask({ assignee })}
            />
          ) : undefined
        }
        onMouseDown={(e) => e.stopPropagation()}
      />
      {questions.length > 0 && (
        <div className="mt-6 space-y-5 text-s leading-relaxed text-foreground">
          {questions.map((item, i) => (
            <div key={i} className="space-y-2">
              <p>
                <strong>Q:</strong> {item.question}
              </p>
              <p>
                <strong>A:</strong> {formatPlanningAnswer(item.answer)}
              </p>
            </div>
          ))}
        </div>
      )}
      {isIncomplete ? (
      <div className="mt-6">
        <label className="mb-2.5 block text-s font-semibold text-foreground">
          Reason it was not completed <span className="text-destructive">*</span>
        </label>
        <textarea
          value={incompleteReason}
          readOnly={!editable}
          required
          rows={3}
          placeholder="Why was this item incomplete or deferred?"
          onChange={(e) => updateAttributes({ incompleteReason: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          className={`w-full resize-y rounded-md border bg-transparent px-3 py-2 text-s text-foreground outline-none placeholder:text-muted-foreground/40 read-only:cursor-default ${
            reasonEmpty ? "border-destructive/50" : "border-border"
          }`}
        />
      </div>
      ) : null}
      {isPlanning ? (
        <>
          <div className="mt-6">
            <label className="mb-2.5 block text-s font-semibold text-foreground">
              Decision <span className="text-destructive">*</span>
            </label>
            <textarea
              value={decision}
              readOnly={!editable}
              required
              rows={3}
              placeholder="What was decided for this item?"
              onChange={(e) => {
                updateAttributes({ decision: e.target.value });
                savePlan({ decision: e.target.value });
              }}
              onBlur={flushPlan}
              onMouseDown={(e) => e.stopPropagation()}
              className={`w-full resize-y rounded-md border bg-transparent px-3 py-2 text-s text-foreground outline-none placeholder:text-muted-foreground/40 read-only:cursor-default ${
                decisionEmpty ? "border-destructive/50" : "border-border"
              }`}
            />
          </div>
          <div className="mt-6">
            <label className="mb-2.5 block text-s font-semibold text-foreground">
              Risk <span className="text-destructive">*</span>
            </label>
            <textarea
              value={risk}
              readOnly={!editable}
              required
              rows={3}
              placeholder="What could block or delay this item?"
              onChange={(e) => {
                updateAttributes({ risk: e.target.value });
                savePlan({ risk: e.target.value });
              }}
              onBlur={flushPlan}
              onMouseDown={(e) => e.stopPropagation()}
              className={`w-full resize-y rounded-md border bg-transparent px-3 py-2 text-s text-foreground outline-none placeholder:text-muted-foreground/40 read-only:cursor-default ${
                riskEmpty ? "border-destructive/50" : "border-border"
              }`}
            />
          </div>
        </>
      ) : null}
    </NodeViewWrapper>
  );
}

export const SprintTaskBlock = SprintTaskBlockSchema.extend({
  addNodeView() {
    return ReactNodeViewRenderer(SprintTaskNodeView, {
      stopEvent: () => true,
    });
  },
});
