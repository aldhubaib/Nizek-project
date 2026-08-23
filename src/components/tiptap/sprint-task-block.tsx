"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { EstimateBadge, SprintTaskRow } from "@/components/project/sprint-task-row";
import { PlanningAssigneePicker, PlanningEstimateInput } from "@/components/project/planning-task-controls";
import {
  formatPlanningAnswer,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";

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
    sprintTasks?: SprintPlanningTask[];
    onTasksPatched?: (taskId: string, patch: Partial<SprintPlanningTask>) => void;
  };
  const projectId = options.projectId;
  const liveTasks = options.sprintTasks ?? [];
  const live = task ? liveTasks.find((item) => item.id === task.id) : undefined;
  const editable = editor.isEditable;
  const decisionEmpty = !decision.trim();
  const riskEmpty = !risk.trim();
  const reasonEmpty = !incompleteReason.trim();
  const canEditFields = editable && isPlanning;

  if (!task) return null;

  const questions = live?.questions?.length ? live.questions : task.questions ?? [];
  const rowTask = {
    ...task,
    estimatedMinutes: task.estimatedMinutes ?? live?.estimatedMinutes ?? null,
    assignee: task.assignee ?? live?.assignee ?? null,
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
      contentEditable={false}
      className="not-prose my-10 select-none"
    >
      <SprintTaskRow
        as="div"
        task={rowTask}
        missingData={false}
        hideStatus
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
          canEditFields && projectId ? (
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
              onChange={(e) => updateAttributes({ decision: e.target.value })}
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
              onChange={(e) => updateAttributes({ risk: e.target.value })}
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

export const SprintTaskBlock = Node.create<{
  projectId?: string;
  sprintTasks?: SprintPlanningTask[];
  onTasksPatched?: (taskId: string, patch: Partial<SprintPlanningTask>) => void;
}>({
  name: "sprintTask",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return { projectId: "", sprintTasks: [], onTasksPatched: undefined };
  },
  addAttributes() {
    return {
      task: {
        default: null as SprintPlanningTask | null,
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-task") || "null") as SprintPlanningTask | null;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => ({
          "data-task": JSON.stringify(attributes.task ?? null),
        }),
      },
      showQuestions: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-show-questions") === "true",
        renderHTML: (attributes) =>
          attributes.showQuestions ? { "data-show-questions": "true" } : {},
      },
      decision: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-decision") ?? "",
        renderHTML: (attributes) => ({ "data-decision": attributes.decision ?? "" }),
      },
      risk: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-risk") ?? "",
        renderHTML: (attributes) => ({ "data-risk": attributes.risk ?? "" }),
      },
      variant: {
        default: "planning",
        parseHTML: (element) => element.getAttribute("data-variant") || "planning",
        renderHTML: (attributes) =>
          attributes.variant && attributes.variant !== "planning"
            ? { "data-variant": attributes.variant }
            : {},
      },
      incompleteReason: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-incomplete-reason") ?? "",
        renderHTML: (attributes) => ({
          "data-incomplete-reason": attributes.incompleteReason ?? "",
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="sprint-task"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "sprint-task",
        contenteditable: "false",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SprintTaskNodeView, {
      stopEvent: () => true,
    });
  },
});
