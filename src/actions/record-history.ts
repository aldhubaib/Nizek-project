"use server";

import { requireProjectMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isModuleId } from "@/lib/modules/registry";
import {
  loadRecordHistory,
  type RecordHistoryBatch,
} from "@/lib/modules/record-history";
import type { WorkflowEntityType } from "@/lib/workflow/types";

export type { RecordHistoryBatch, RecordHistoryEntry, RecordHistoryUser } from "@/lib/modules/record-history";

export async function listRecordHistory(
  entityType: WorkflowEntityType,
  recordId: string,
): Promise<RecordHistoryBatch[]> {
  if (!isModuleId(entityType) || !recordId.trim()) return [];

  const row = await prisma.boardRecord.findUnique({
    where: { id: recordId },
    select: { projectId: true },
  });
  if (!row) return [];
  await requireProjectMember(row.projectId);

  return loadRecordHistory(entityType, recordId);
}
