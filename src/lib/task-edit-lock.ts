import { getActiveContract } from "@/lib/contract-rules";
import { canModifyInStage, type ProjectRolePermissions } from "@/lib/permissions";
import { stageLabel } from "@/lib/task-label";

type ContractRow = Parameters<typeof getActiveContract>[0][number];

/**
 * Why the task detail screen has to render read-only, or null when it is
 * editable.
 *
 * These are the same two gates updateTask enforces, in the same order. The
 * screen has to know them because it drives inputs rather than a submit
 * button: without this it offered a live priority dropdown and title field on
 * a task the server would refuse to change, and the refusal surfaced as the
 * value quietly snapping back with no explanation.
 *
 * The contract gate deliberately catches admins too, matching updateTask —
 * an expired contract freezes the project for everyone.
 */
export function taskEditBlockedReason(input: {
  contracts: ContractRow[];
  isSystemAdmin: boolean;
  permissions: ProjectRolePermissions;
  stage: string;
}): string | null {
  if (!getActiveContract(input.contracts)) {
    return "No active contract — this project is read-only. Add a new contract to re-enable editing.";
  }
  if (!input.isSystemAdmin && !canModifyInStage(input.permissions, input.stage)) {
    return `Your role cannot edit tasks in ${stageLabel(input.stage)}.`;
  }
  return null;
}
