"use server";

import {
  createWorkflowStatus,
  deleteWorkflowStatus,
  listWorkflowStatuses,
  listWorkflowTransitions,
  reorderWorkflowStatuses,
  updateWorkflowStatus,
  type WorkflowStatusDTO,
  type WorkflowTransitionDTO,
} from "@/actions/workflow";
import { requiredFieldIds } from "@/lib/workflow/engine";
import { NATIVE_FIELDS, type NativeFieldId } from "@/lib/fields/types";

/** A workflow status as the board columns see it. */
export type StageDTO = {
  id: string;
  flowId: string;
  name: string;
  color: string;
  position: number;
  requiredFields: NativeFieldId[];
  actions: WorkflowTransitionDTO["actions"];
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toStageDTO(row: WorkflowStatusDTO): StageDTO {
  return {
    id: row.id,
    flowId: row.workflowId,
    name: row.name,
    color: row.color,
    position: row.position,
    requiredFields: requiredFieldIds(row.actions).filter(
      (id): id is NativeFieldId => NATIVE_FIELDS.some((field) => field.id === id),
    ),
    actions: row.actions,
  };
}

export async function listStages(flowId: string): Promise<StageDTO[]> {
  const rows = await listWorkflowStatuses(flowId);
  return rows.map(toStageDTO);
}

export async function listTransitionGraph(
  flowId: string,
): Promise<WorkflowTransitionDTO[]> {
  return listWorkflowTransitions(flowId);
}

export async function createStage(input: {
  flowId: string;
  name: string;
  color?: string;
}): Promise<ActionResult<StageDTO>> {
  const result = await createWorkflowStatus({
    workflowId: input.flowId,
    name: input.name,
    color: input.color,
  });
  if (!result.ok) return result;
  return { ok: true, data: toStageDTO(result.data) };
}

export async function updateStage(
  id: string,
  input: { name: string; color?: string },
): Promise<ActionResult<StageDTO>> {
  const result = await updateWorkflowStatus(id, input);
  if (!result.ok) return result;
  return { ok: true, data: toStageDTO(result.data) };
}

export async function deleteStage(
  id: string,
): Promise<ActionResult<{ id: string; unassignedRecords: number }>> {
  const result = await deleteWorkflowStatus(id);
  if (!result.ok) return result;
  return { ok: true, data: { id: result.data.id, unassignedRecords: result.data.unassigned } };
}

export async function reorderStages(
  flowId: string,
  orderedIds: string[],
): Promise<ActionResult<StageDTO[]>> {
  const result = await reorderWorkflowStatuses(flowId, orderedIds);
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toStageDTO) };
}
