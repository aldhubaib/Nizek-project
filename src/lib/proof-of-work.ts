import type { Stage } from "@/store/kanban";

export function needsProofOfWork(fromStage: Stage | string, toStage: Stage | string) {
  return toStage === "INTERNAL_REVIEW" && fromStage !== "INTERNAL_REVIEW";
}

/** Latest proof is the current approved work once the task reaches review, and
 *  stays so through everything after it. */
export function isProofApprovedStage(stage: Stage | string) {
  return (
    stage === "INTERNAL_REVIEW" ||
    stage === "DONE" ||
    stage === "COMPLETED" ||
    stage === "SHIPPED"
  );
}
