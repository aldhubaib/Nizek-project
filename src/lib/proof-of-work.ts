import type { Stage } from "@/store/kanban";

export function needsProofOfWork(fromStage: Stage | string, toStage: Stage | string) {
  return toStage === "INTERNAL_REVIEW" && fromStage !== "INTERNAL_REVIEW";
}
