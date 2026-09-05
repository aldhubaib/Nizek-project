import {
  getSprintPlanningTasks,
  getSprintProofOfWork,
  getSprintReviewTasks,
} from "@/actions/sprint";
import type { SprintPlanningTask, SprintTaskProof } from "@/lib/sprint-planning-doc";
import type { SprintRemovedTask } from "@/lib/sprint-doc";
import { isUnstartedSprint } from "@/lib/sprint-status";

export type SprintDocTasks = {
  tasks: SprintPlanningTask[];
  status: string;
  /**
   * The work that left the sprint after it started. Empty while the sprint is
   * still being planned, where nothing has been committed to and so nothing can
   * be taken back.
   */
  removed: SprintRemovedTask[];
  /**
   * The proof behind each delivered task, by task id. Empty before the sprint
   * starts, where nothing has been delivered yet.
   */
  proof: Record<string, SprintTaskProof>;
};

/**
 * The tasks a sprint document needs, which depend on the sprint's age: the live
 * list while it is still being planned, and the completed / incomplete split
 * from then on. The plan payload is fetched first because it is what says which.
 */
export async function loadSprintDocTasks(sprintId: string): Promise<SprintDocTasks> {
  const planning = await getSprintPlanningTasks(sprintId);
  if (isUnstartedSprint(planning.status)) {
    return { tasks: planning.tasks, status: planning.status, removed: [], proof: {} };
  }
  const [review, proof] = await Promise.all([
    getSprintReviewTasks(sprintId),
    getSprintProofOfWork(sprintId),
  ]);
  return {
    tasks: [...review.completed, ...review.incomplete],
    status: review.status,
    removed: review.removed,
    proof,
  };
}
