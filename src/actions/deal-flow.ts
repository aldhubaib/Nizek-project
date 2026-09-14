"use server";

import { listWorkflows, type WorkflowDTO } from "@/actions/workflow";

export type DealFlowDTO = {
  id: string;
  name: string;
  position: number;
  stageCount: number;
  dealCount: number;
  layoutId: string | null;
  blueprintEnabled: boolean;
};

function toFlowDTO(row: WorkflowDTO): DealFlowDTO {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    stageCount: row.statusCount,
    dealCount: row.recordCount,
    layoutId: row.layoutId,
    blueprintEnabled: row.blueprintEnabled,
  };
}

export async function listDealFlows(): Promise<DealFlowDTO[]> {
  const rows = await listWorkflows("deal");
  return rows.map(toFlowDTO);
}
