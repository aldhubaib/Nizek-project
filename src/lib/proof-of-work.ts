import type { Stage } from "@/store/kanban";

export function needsProofOfWork(fromStage: Stage | string, toStage: Stage | string) {
  return toStage === "INTERNAL_REVIEW" && fromStage !== "INTERNAL_REVIEW";
}

/** Latest proof is the current approved work while the task sits at review or done. */
export function isProofApprovedStage(stage: Stage | string) {
  return (
    stage === "INTERNAL_REVIEW" ||
    stage === "CLIENT_REVIEW" ||
    stage === "DONE" ||
    stage === "READY_FOR_RELEASE"
  );
}
