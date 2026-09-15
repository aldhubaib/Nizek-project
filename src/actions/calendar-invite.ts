"use server";

import { prisma } from "@/lib/prisma";
import { verifyInviteToken } from "@/lib/calendar-ics";
import {
  formatInviteWhen,
  inviteMapsUrl,
  isInviteRsvp,
  parseInviteValue,
  stringifyInviteValue,
  type InviteRsvp,
} from "@/lib/fields/invite";
import type { WorkflowEntityType } from "@/lib/workflow/types";
import { isModuleId } from "@/lib/modules/registry";

export type InviteRsvpView = {
  title: string;
  recordTitle: string;
  when: string;
  location: string;
  mapsUrl: string;
  status: InviteRsvp;
  already: boolean;
};

async function recordTitle(
  entityType: WorkflowEntityType,
  recordId: string,
): Promise<string> {
  if (entityType === "deal") {
    const row = await prisma.deal.findUnique({
      where: { id: recordId },
      select: { title: true },
    });
    return row?.title ?? "Meeting";
  }
  if (entityType === "contact") {
    const row = await prisma.contact.findUnique({
      where: { id: recordId },
      select: { title: true },
    });
    return row?.title ?? "Meeting";
  }
  if (entityType === "company") {
    const row = await prisma.company.findUnique({
      where: { id: recordId },
      select: { nameEn: true },
    });
    return row?.nameEn ?? "Meeting";
  }
  const row = await prisma.boardRecord.findUnique({
    where: { id: recordId },
    select: { title: true },
  });
  return row?.title ?? "Meeting";
}

export async function loadInviteRsvp(
  token: string,
): Promise<InviteRsvpView | null> {
  const payload = verifyInviteToken(token);
  if (!payload || !isModuleId(payload.entityType)) return null;

  const [field, valueRow] = await Promise.all([
    prisma.customField.findUnique({
      where: { id: payload.fieldId },
      select: { label: true, type: true },
    }),
    prisma.customFieldValue.findUnique({
      where: {
        entityType_recordId_fieldId: {
          entityType: payload.entityType,
          recordId: payload.recordId,
          fieldId: payload.fieldId,
        },
      },
      select: { value: true },
    }),
  ]);
  if (!field || field.type !== "invite") return null;

  const invite = parseInviteValue(valueRow?.value);
  const attendee = invite.attendees.find(
    (row) => row.kind === payload.kind && row.id === payload.personId,
  );
  if (!attendee) return null;

  return {
    title: field.label,
    recordTitle: await recordTitle(payload.entityType, payload.recordId),
    when: formatInviteWhen(invite.start),
    location: invite.location,
    mapsUrl: inviteMapsUrl(invite),
    status: attendee.status,
    already: attendee.status !== "needs_action",
  };
}

export async function respondToInvite(
  token: string,
  status: string,
): Promise<{ ok: true; data: InviteRsvpView } | { ok: false; error: string }> {
  if (!isInviteRsvp(status) || status === "needs_action") {
    return { ok: false, error: "Pick Yes, Maybe, or No" };
  }
  const payload = verifyInviteToken(token);
  if (!payload || !isModuleId(payload.entityType)) {
    return { ok: false, error: "This invite link is not valid" };
  }

  const valueRow = await prisma.customFieldValue.findUnique({
    where: {
      entityType_recordId_fieldId: {
        entityType: payload.entityType,
        recordId: payload.recordId,
        fieldId: payload.fieldId,
      },
    },
    select: { value: true },
  });
  const invite = parseInviteValue(valueRow?.value);
  const index = invite.attendees.findIndex(
    (row) => row.kind === payload.kind && row.id === payload.personId,
  );
  if (index < 0) return { ok: false, error: "You are not on this invite" };

  const next = {
    ...invite,
    attendees: invite.attendees.map((row, i) =>
      i === index ? { ...row, status } : row,
    ),
  };
  const serialized = stringifyInviteValue(next);
  await prisma.customFieldValue.upsert({
    where: {
      entityType_recordId_fieldId: {
        entityType: payload.entityType,
        recordId: payload.recordId,
        fieldId: payload.fieldId,
      },
    },
    create: {
      entityType: payload.entityType,
      recordId: payload.recordId,
      fieldId: payload.fieldId,
      value: serialized,
    },
    update: { value: serialized },
  });

  const view = await loadInviteRsvp(token);
  if (!view) return { ok: false, error: "Could not save that reply" };
  return { ok: true, data: { ...view, status, already: true } };
}
