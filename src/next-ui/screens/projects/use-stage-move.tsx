"use client";

import * as React from "react";

import { canTransition } from "@/lib/permissions";
import { stageLabel } from "@/lib/task-label";
import { taskErrorText, useMoveTask, type TaskRow } from "@/next-ui/data/tasks";

import type { ViewerRights } from "./project-screen";
import { ApproveDialog, DeclineDialog, EstimateDialog, ProofDialog } from "./task-dialogs";

/**
 * Moving a task to another stage, with the live board's checkpoints in one place so the sprint
 * board and the task screen behave the same: the role's allowed transitions first; an estimate
 * before In development; the proof video before Internal review (unless the project says "No
 * video"); a word of approval before Done; a reason (and files) when review sends a task back.
 * Anything the server refuses is shown in its words. The screen renders `dialogs` once and
 * calls `request` from a drop or a menu.
 */
export function useStageMove(projectId: string, rights: ViewerRights) {
  const move = useMoveTask(projectId);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<null | { kind: "estimate" | "approve" | "decline" | "proof"; task: TaskRow; to: string; order: number }>(null);

  const doMove = React.useCallback(
    async (task: TaskRow, to: string, order: number, extra?: { estimatedMinutes?: number }) => {
      setNotice(null);
      try {
        await move.mutateAsync({ taskId: task.id, stage: to as TaskRow["stage"], order, ...extra });
      } catch (err) {
        setNotice(taskErrorText(err));
        throw err;
      }
    },
    [move],
  );

  /** Starts a move; opens a checkpoint dialog when one is due, else moves straight away. */
  const request = React.useCallback(
    (task: TaskRow, to: string, order: number) => {
      const from = task.stage;
      if (from === to) return;
      setNotice(null);
      const decline = from === "INTERNAL_REVIEW" && to === "IN_DEVELOPMENT";
      if (decline) {
        if (!rights.canDeclineTasks) {
          setNotice("Your role cannot send tasks back from Internal review.");
          return;
        }
        setPending({ kind: "decline", task, to, order });
        return;
      }
      if (!canTransition(rights.perms, from, to)) {
        setNotice(`Your role cannot move tasks from ${stageLabel(from)} to ${stageLabel(to)}.`);
        return;
      }
      if (to === "IN_DEVELOPMENT" && !task.estimatedMinutes) {
        setPending({ kind: "estimate", task, to, order });
        return;
      }
      if (to === "INTERNAL_REVIEW" && rights.proofVideoMode !== "NONE") {
        setPending({ kind: "proof", task, to, order });
        return;
      }
      if (to === "DONE") {
        setPending({ kind: "approve", task, to, order });
        return;
      }
      void doMove(task, to, order).catch(() => undefined);
    },
    [rights, doMove],
  );

  const close = () => setPending(null);
  const dialogs = (
    <>
      <EstimateDialog open={pending?.kind === "estimate"} task={pending?.task ?? null} onClose={close} onConfirm={(minutes) => (pending ? doMove(pending.task, pending.to, pending.order, { estimatedMinutes: minutes }) : undefined)} />
      <ApproveDialog open={pending?.kind === "approve"} task={pending?.task ?? null} onClose={close} onConfirm={() => (pending ? doMove(pending.task, pending.to, pending.order) : undefined)} />
      <DeclineDialog open={pending?.kind === "decline"} task={pending?.task ?? null} projectId={projectId} onClose={close} />
      <ProofDialog open={pending?.kind === "proof"} task={pending?.task ?? null} projectId={projectId} order={pending?.order ?? 0} mode={rights.proofVideoMode} onClose={close} />
    </>
  );

  return { request, notice, clearNotice: () => setNotice(null), dialogs, busy: move.isPending };
}
