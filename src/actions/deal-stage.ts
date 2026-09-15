"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { createAndPublishNotifications } from "@/lib/notify";
import { dispatchSendInviteActions } from "@/lib/calendar-invite-send";
import { saveCustomFieldValues } from "@/actions/custom-field";
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
import { parseActionConfig } from "@/lib/workflow/actions";
import { logRecordChanges } from "@/lib/modules/record-history";
import {
  actionsForMove,
  allowedDestinations,
  applySetFieldActions,
  findTransition,
  isMoveAllowed,
  missingRequiredOnSnapshot,
  notifyUserIds,
  requiredFieldIds,
  sendInviteActionsForMove,
  validateDuring,
} from "@/lib/workflow/engine";
import type { DealBlueprintFieldId } from "@/lib/deal-blueprint";
import { isCustomFieldType, type CustomFieldType } from "@/lib/fields/types";
import type { DuringPayload, FieldSnapshot } from "@/lib/workflow/types";

export type DealStageDTO = {
  id: string;
  flowId: string;
  name: string;
  color: string;
  position: number;
  requiredFields: DealBlueprintFieldId[];
  actions: WorkflowTransitionDTO["actions"];
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toStageDTO(row: WorkflowStatusDTO): DealStageDTO {
  return {
    id: row.id,
    flowId: row.workflowId,
    name: row.name,
    color: row.color,
    position: row.position,
    requiredFields: requiredFieldIds(row.actions).filter(
      (id): id is DealBlueprintFieldId =>
        id === "title" || id === "value" || id === "contacts" || id === "companies",
    ),
    actions: row.actions,
  };
}

function revalidateDeals() {
  revalidatePath("/dashboard/deals");
  revalidatePath("/dashboard/deals/settings");
  revalidatePath("/dashboard/deals/settings/blueprint");
  revalidatePath("/dashboard/deals/settings/layout");
}

export async function listDealStages(flowId: string): Promise<DealStageDTO[]> {
  const rows = await listWorkflowStatuses(flowId);
  return rows.map(toStageDTO);
}

export async function listDealTransitionGraph(
  flowId: string,
): Promise<WorkflowTransitionDTO[]> {
  return listWorkflowTransitions(flowId);
}

export async function createDealStage(input: {
  flowId: string;
  name: string;
  color?: string;
}): Promise<ActionResult<DealStageDTO>> {
  const result = await createWorkflowStatus({
    workflowId: input.flowId,
    name: input.name,
    color: input.color,
  });
  if (!result.ok) return result;
  return { ok: true, data: toStageDTO(result.data) };
}

export async function updateDealStage(
  id: string,
  input: { name: string; color?: string },
): Promise<ActionResult<DealStageDTO>> {
  const result = await updateWorkflowStatus(id, input);
  if (!result.ok) return result;
  return { ok: true, data: toStageDTO(result.data) };
}

export async function deleteDealStage(
  id: string,
): Promise<ActionResult<{ id: string; unassignedDeals: number }>> {
  const result = await deleteWorkflowStatus(id);
  if (!result.ok) return result;
  return { ok: true, data: { id: result.data.id, unassignedDeals: result.data.unassigned } };
}

export async function reorderDealStages(
  flowId: string,
  orderedIds: string[],
): Promise<ActionResult<DealStageDTO[]>> {
  const result = await reorderWorkflowStatuses(flowId, orderedIds);
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toStageDTO) };
}

async function dealSnapshot(dealId: string): Promise<{
  snapshot: FieldSnapshot;
  title: string;
  workflowId: string;
  layoutId: string | null;
  blueprintEnabled: boolean;
  statusId: string | null;
}> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      contacts: { select: { contactId: true } },
      companies: { select: { companyId: true } },
      workflow: { select: { layoutId: true, blueprintEnabled: true } },
    },
  });
  if (!deal) throw new Error("That deal no longer exists");

  const values = await prisma.customFieldValue.findMany({
    where: { entityType: "deal", recordId: dealId },
    select: { fieldId: true, value: true },
  });

  return {
    title: deal.title,
    workflowId: deal.workflowId,
    layoutId: deal.workflow.layoutId,
    blueprintEnabled: deal.workflow.blueprintEnabled,
    statusId: deal.statusId,
    snapshot: {
      native: {
        title: deal.title,
        value: deal.value ? deal.value.toString() : null,
        contactIds: deal.contacts.map((c) => c.contactId),
        companyIds: deal.companies.map((c) => c.companyId),
      },
      custom: Object.fromEntries(values.map((v) => [v.fieldId, v.value])),
    },
  };
}

export async function moveDealToStage(
  dealId: string,
  stageId: string | null,
  payload: DuringPayload = {},
): Promise<ActionResult<{ id: string; stageId: string | null }>> {
  try {
    const user = await requireContactsAccess();
    const loaded = await dealSnapshot(dealId);

    if (stageId) {
      const target = await prisma.workflowStatus.findUnique({
        where: { id: stageId },
        select: { id: true, workflowId: true },
      });
      if (!target) throw new Error("That column no longer exists");
      if (target.workflowId !== loaded.workflowId) {
        throw new Error("That column is on a different flow");
      }
    }

    if (!loaded.blueprintEnabled) {
      await prisma.deal.update({
        where: { id: dealId },
        data: { statusId: stageId },
      });
      await logRecordChanges({
        entityType: "deal",
        recordId: dealId,
        userId: user.id,
        before: {
          title: loaded.title,
          statusId: loaded.statusId,
          fieldValues: loaded.snapshot.custom,
        },
        after: {
          title: loaded.title,
          statusId: stageId,
          fieldValues: loaded.snapshot.custom,
        },
        fields: [],
      });
      revalidateDeals();
      return { ok: true, data: { id: dealId, stageId } };
    }

    const [statuses, transitions, customFields] = await Promise.all([
      prisma.workflowStatus.findMany({
        where: { workflowId: loaded.workflowId },
        include: { actions: true },
      }),
      prisma.workflowTransition.findMany({
        where: { workflowId: loaded.workflowId },
        include: { actions: true },
      }),
      prisma.customField.findMany({
        where: loaded.layoutId
          ? { layoutId: loaded.layoutId }
          : { entityType: "deal" },
        select: { id: true, label: true, type: true, visibility: true },
      }),
    ]);

    const transitionDefs = transitions.map((t) => ({
      id: t.id,
      workflowId: t.workflowId,
      name: t.name,
      fromStatusId: t.fromStatusId,
      toStatusId: t.toStatusId,
      canvasX: t.canvasX,
      canvasY: t.canvasY,
      actions: t.actions.map((a) => ({
        id: a.id,
        hook: a.hook as WorkflowTransitionDTO["actions"][number]["hook"],
        type: a.type as WorkflowTransitionDTO["actions"][number]["type"],
        config: parseActionConfig(a.config),
        position: a.position,
      })),
    }));

    const allowedToIds = allowedDestinations(loaded.statusId, transitionDefs);
    if (
      !isMoveAllowed({
        fromStatusId: loaded.statusId,
        toStatusId: stageId,
        transitionCount: transitions.length,
        allowedToIds,
        enabled: loaded.blueprintEnabled,
      })
    ) {
      throw new Error("The blueprint does not allow that move");
    }

    const from = statuses.find((s) => s.id === loaded.statusId);
    const to = statuses.find((s) => s.id === stageId);
    const toActions = (row: (typeof statuses)[number] | undefined) =>
      (row?.actions ?? []).map((a) => ({
        id: a.id,
        hook: a.hook as WorkflowTransitionDTO["actions"][number]["hook"],
        type: a.type as WorkflowTransitionDTO["actions"][number]["type"],
        config: parseActionConfig(a.config),
        position: a.position,
      }));

    const transition = findTransition(loaded.statusId, stageId, transitionDefs);
    const grouped = actionsForMove({
      fromActions: toActions(from),
      toActions: toActions(to),
      transition,
    });

    const fieldLookup = customFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: (isCustomFieldType(f.type) ? f.type : "text") as CustomFieldType,
      visibility: f.visibility,
    }));

    if (loaded.statusId && stageId && loaded.statusId !== stageId) {
      const beforeMissing = missingRequiredOnSnapshot(
        loaded.snapshot,
        requiredFieldIds(grouped.before),
        fieldLookup,
      );
      if (beforeMissing.length > 0) {
        throw new Error(
          `Fill ${beforeMissing.join(", ")} before leaving ${from?.name ?? "this status"}`,
        );
      }

      const duringErrors = validateDuring(
        grouped.during,
        loaded.snapshot,
        payload,
        fieldLookup,
      );
      if (duringErrors.length > 0) {
        throw new Error(duringErrors.join(". "));
      }
    }

    const merged: FieldSnapshot = {
      native: {
        title: payload.nativePatches?.title ?? loaded.snapshot.native.title,
        value:
          payload.nativePatches?.value !== undefined
            ? payload.nativePatches.value
            : loaded.snapshot.native.value,
        contactIds:
          payload.nativePatches?.contactIds ?? loaded.snapshot.native.contactIds,
        companyIds:
          payload.nativePatches?.companyIds ?? loaded.snapshot.native.companyIds,
      },
      custom: { ...loaded.snapshot.custom, ...payload.customValues },
    };
    const after = applySetFieldActions(
      [...grouped.before, ...grouped.after],
      merged,
    );

    await prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id: dealId },
        data: {
          statusId: stageId,
          title: after.native.title,
          value: after.native.value,
          contacts: {
            deleteMany: {},
            create: after.native.contactIds.map((contactId) => ({ contactId })),
          },
          companies: {
            deleteMany: {},
            create: after.native.companyIds.map((companyId) => ({ companyId })),
          },
        },
      });
    });

    await saveCustomFieldValues({
      entityType: "deal",
      recordId: dealId,
      values: after.custom,
      layoutId: loaded.layoutId,
    });

    const recipients = notifyUserIds(grouped.after);
    if (recipients.length > 0) {
      const destName = to?.name ?? "Unassigned";
      await createAndPublishNotifications({
        recipientIds: recipients,
        type: "deal_workflow",
        title: `${loaded.title} moved to ${destName}`,
        body: transition?.name ?? destName,
        linkUrl: `/dashboard/deals/${dealId}`,
      });
    }

    await dispatchSendInviteActions({
      actions: sendInviteActionsForMove({
        fromActions: toActions(from),
        toActions: toActions(to),
        transition,
      }),
      entityType: "deal",
      recordId: dealId,
      recordTitle: after.native.title,
      fields: customFields,
      values: after.custom,
      organizer: {
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
      },
      linkUrl: `/dashboard/deals/${dealId}`,
      layoutId: loaded.layoutId,
    });

    await logRecordChanges({
      entityType: "deal",
      recordId: dealId,
      userId: user.id,
      before: {
        title: loaded.snapshot.native.title,
        value: loaded.snapshot.native.value,
        statusId: loaded.statusId,
        contactIds: loaded.snapshot.native.contactIds,
        companyIds: loaded.snapshot.native.companyIds,
        fieldValues: loaded.snapshot.custom,
      },
      after: {
        title: after.native.title,
        value: after.native.value,
        statusId: stageId,
        contactIds: after.native.contactIds,
        companyIds: after.native.companyIds,
        fieldValues: after.custom,
      },
      fields: customFields,
    });

    revalidateDeals();
    return { ok: true, data: { id: dealId, stageId } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error("[deal-stage:move]", err);
    return { ok: false, error };
  }
}
