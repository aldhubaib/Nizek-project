"use server";

import { requireProjectMember } from "@/lib/auth";
import { requireContactsAccess } from "@/lib/contacts-access";
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

  if (entityType === "board") {
    const row = await prisma.boardRecord.findUnique({
      where: { id: recordId },
      select: { projectId: true },
    });
    if (!row) return [];
    await requireProjectMember(row.projectId);
  } else {
    await requireContactsAccess();
    const exists =
      entityType === "deal"
        ? await prisma.deal.findUnique({
            where: { id: recordId },
            select: { id: true },
          })
        : entityType === "contact"
          ? await prisma.contact.findUnique({
              where: { id: recordId },
              select: { id: true },
            })
          : await prisma.company.findUnique({
              where: { id: recordId },
              select: { id: true },
            });
    if (!exists) return [];
  }

  return loadRecordHistory(entityType, recordId);
}
