"use client";

import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { SprintTaskBlockSchema } from "@/lib/tiptap-schema";
import { EstimateBadge, SprintTaskRow } from "@/components/project/sprint-task-row";
import { PlanningAssigneePicker, PlanningEstimateInput } from "@/components/project/planning-task-controls";
import { updateSprintTaskPlan } from "@/actions/sprint";
import { uploadFileToR2 } from "@/lib/upload";
import { ProofVideoList } from "@/components/proof/proof-video-list";
import {
  formatPlanningAnswer,
  formatPlanningDate,
  type SprintPlanningTask,
  type SprintTaskProof,
} from "@/lib/sprint-planning-doc";

/** Matches the other planning fields, which already autosave on a short pause. */
const PLAN_SAVE_DELAY_MS = 600;

function SprintTaskNodeView({ node, updateAttributes, editor, extension }: ReactNodeViewProps) {
  const task = node.attrs.task as SprintPlanningTask | null;
  const variant = (node.attrs.variant as string) || "planning";
  const isPlanning = variant === "planning";
  const isIncomplete = variant === "incomplete";
  const isCompleted = variant === "completed";
  const isRemoved = variant === "removed";
  const decision = String(node.attrs.decision ?? "");
  const risk = String(node.attrs.risk ?? "");
  const incompleteReason = String(node.attrs.incompleteReason ?? "");
  const description = String(node.attrs.description ?? "");
  const descriptionImages = (node.attrs.descriptionImages as string[] | null) ?? [];
  const movedTo = (node.attrs.movedTo as string | null) ?? null;
  const [uploading, setUploading] = useState(0);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const options = extension.options as {
    projectId?: string;
    sprintId?: string;
    sprintTasks?: SprintPlanningTask[];
    sprintProof?: Record<string, SprintTaskProof>;
    hideAssignee?: boolean;
    onTasksPatched?: (taskId: string, patch: Partial<SprintPlanningTask>) => void;
  };
  const proof = task?.id ? options.sprintProof?.[task.id] : undefined;
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
  // Decision and Risk are what the team committed to, so they follow the task
  // into the outcome rather than staying behind in a second copy of the list.
  // They are read-only there: the sprint has started, and a promise that can be
  // rewritten afterwards is not one. Work pulled in mid-sprint has neither, and
  // shows neither instead of two empty boxes.
  const showPlanFields = isPlanning || !decisionEmpty || !riskEmpty;
  const planFieldsReadOnly = !editable || !isPlanning;
  // Whoever moved the task answered this in the dialog at the time. It is shown
  // here so the card explains itself, but it is not this document's to edit.
  const addedReason = (live?.unplannedReason ?? task?.unplannedReason ?? "").trim();

  async function addImages(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploading((n) => n + images.length);
    for (const file of images) {
      try {
        const { url } = await uploadFileToR2(file);
        const current = (node.attrs.descriptionImages as string[] | null) ?? [];
        updateAttributes({ descriptionImages: [...current, url] });
      } catch {
        /* A failed upload leaves the written description untouched. */
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
  }

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
      {showPlanFields ? (
        <>
          <div className="mt-6">
            <label className="mb-2.5 block text-s font-semibold text-foreground">
              Decision {isPlanning ? <span className="text-destructive">*</span> : null}
            </label>
            <textarea
              value={decision}
              readOnly={planFieldsReadOnly}
              required={isPlanning}
              rows={3}
              placeholder="What was decided for this item?"
              onChange={(e) => {
                updateAttributes({ decision: e.target.value });
                savePlan({ decision: e.target.value });
              }}
              onBlur={flushPlan}
              onMouseDown={(e) => e.stopPropagation()}
              className={`w-full resize-y rounded-md border bg-transparent px-3 py-2 text-s text-foreground outline-none placeholder:text-muted-foreground/40 read-only:cursor-default ${
                decisionEmpty && isPlanning ? "border-destructive/50" : "border-border"
              }`}
            />
          </div>
          <div className="mt-6">
            <label className="mb-2.5 block text-s font-semibold text-foreground">
              Risk {isPlanning ? <span className="text-destructive">*</span> : null}
            </label>
            <textarea
              value={risk}
              readOnly={planFieldsReadOnly}
              required={isPlanning}
              rows={3}
              placeholder="What could block or delay this item?"
              onChange={(e) => {
                updateAttributes({ risk: e.target.value });
                savePlan({ risk: e.target.value });
              }}
              onBlur={flushPlan}
              onMouseDown={(e) => e.stopPropagation()}
              className={`w-full resize-y rounded-md border bg-transparent px-3 py-2 text-s text-foreground outline-none placeholder:text-muted-foreground/40 read-only:cursor-default ${
                riskEmpty && isPlanning ? "border-destructive/50" : "border-border"
              }`}
            />
          </div>
        </>
      ) : null}
      {/* Where Decision and Risk sit on committed work: an item pulled into a
          running sprint was never planned, so what it has instead is why. */}
      {addedReason && !isRemoved ? (
        <div className="mt-6">
          <p className="mb-2.5 text-s font-semibold text-foreground">Reason for adding</p>
          <p className="rounded-md border border-border bg-transparent px-3 py-2 text-s leading-relaxed text-muted-foreground">
            {addedReason}
          </p>
        </div>
      ) : null}
      {isRemoved ? (
        <div className="mt-6">
          <p className="mb-2.5 text-s font-semibold text-foreground">Reason for removing</p>
          <p className="rounded-md border border-border bg-transparent px-3 py-2 text-s leading-relaxed text-muted-foreground">
            {incompleteReason || "No reason was recorded."}
          </p>
          {movedTo ? (
            <p className="mt-2 text-s text-muted-foreground">
              Moved to <span className="font-medium text-foreground">{movedTo}</span>.
            </p>
          ) : null}
        </div>
      ) : null}
      {isCompleted ? (
        <div className="mt-6">
          <p className="mb-2.5 text-s font-semibold text-foreground">Proof of work</p>
          {proof && proof.videos.length > 0 ? (
            // Inside a node view, so the editor is kept out of the click that
            // opens the player.
            <div className="space-y-2" onMouseDown={(e) => e.stopPropagation()}>
              <ProofVideoList videos={proof.videos} />
            </div>
          ) : (
            // No video to show, so the card says why rather than leaving a gap
            // that reads as though proof was never asked for.
            <p className="rounded-md border border-border bg-transparent px-3 py-2 text-s leading-relaxed text-muted-foreground">
              {proof?.bypassedAtIso
                ? `The proof requirement was waived on ${formatPlanningDate(proof.bypassedAtIso)}${
                    proof.bypassedByName ? ` by ${proof.bypassedByName}` : ""
                  }.`
                : "No proof of work was recorded for this item."}
            </p>
          )}
        </div>
      ) : null}
      {/* Only when there is no recording to speak for the work. Asking for this
          beside a video would be asking the same question twice. */}
      {isCompleted && !(proof && proof.videos.length > 0) ? (
        <div className="mt-6">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <label className="text-s font-semibold text-foreground">
              What was delivered {editable ? <span className="text-destructive">*</span> : null}
            </label>
            {editable ? (
              <button
                type="button"
                onClick={() => imageInput.current?.click()}
                onMouseDown={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              >
                {uploading > 0 ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="size-3.5" />
                )}
                Add photo
              </button>
            ) : null}
          </div>
          <textarea
            value={description}
            readOnly={!editable}
            rows={3}
            placeholder="Describe what was delivered. Paste a screenshot here to attach it."
            onChange={(e) => updateAttributes({ description: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            onPaste={(e) => {
              if (!editable) return;
              const files = Array.from(e.clipboardData.items)
                .filter((item) => item.type.startsWith("image/"))
                .map((item) => item.getAsFile())
                .filter((file): file is File => file != null);
              if (files.length === 0) return;
              e.preventDefault();
              void addImages(files);
            }}
            className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-s text-foreground outline-none placeholder:text-muted-foreground/40 read-only:cursor-default"
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
          {descriptionImages.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-3">
              {descriptionImages.map((src) => (
                <div key={src} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="max-h-48 rounded-md border border-border object-contain"
                  />
                  {editable ? (
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        updateAttributes({
                          descriptionImages: descriptionImages.filter((url) => url !== src),
                        })
                      }
                      className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-overlay text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {/* Last, because it answers what the two fields above promised. */}
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
