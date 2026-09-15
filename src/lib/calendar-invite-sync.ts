import "server-only";

import { prisma } from "@/lib/prisma";
import { saveCustomFieldValues } from "@/actions/custom-field";
import { getGoogleCalendarAttendeeRsvps } from "@/lib/google-calendar";
import {
  attendeeKey,
  parseInviteValue,
  stringifyInviteValue,
} from "@/lib/fields/invite";
import type { WorkflowEntityType } from "@/lib/workflow/types";

async function emailsByAttendee(
  attendees: { kind: "user" | "contact"; id: string }[],
): Promise<Map<string, string>> {
  const userIds = attendees.filter((row) => row.kind === "user").map((row) => row.id);
  const contactIds = attendees
    .filter((row) => row.kind === "contact")
    .map((row) => row.id);
  const [users, contacts] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : Promise.resolve([]),
    contactIds.length
      ? prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, email: true },
        })
      : Promise.resolve([]),
  ]);
  const map = new Map<string, string>();
  for (const user of users) {
    if (user.email.trim()) map.set(`user:${user.id}`, user.email.trim().toLowerCase());
  }
  for (const contact of contacts) {
    const email = contact.email?.trim().toLowerCase() ?? "";
    if (email) map.set(`contact:${contact.id}`, email);
  }
  return map;
}

/** Copy Yes / Maybe / No from Google Calendar onto the invite field. */
export async function syncGoogleInviteRsvps(input: {
  viewerUserId: string;
  entityType: WorkflowEntityType;
  recordId: string;
  values: Record<string, string>;
  layoutId?: string | null;
}): Promise<Record<string, string>> {
  const nextValues = { ...input.values };
  let wrote = false;

  for (const [fieldId, raw] of Object.entries(nextValues)) {
    const parsed = parseInviteValue(raw);
    if (!parsed.googleEventId || parsed.attendees.length === 0) continue;

    const organizerId = parsed.googleOrganizerId || input.viewerUserId;
    const rsvps = await getGoogleCalendarAttendeeRsvps(
      organizerId,
      parsed.googleEventId,
    );
    if (!rsvps || rsvps.size === 0) continue;

    const emails = await emailsByAttendee(parsed.attendees);
    const nextAttendees = parsed.attendees.map((attendee) => {
      const email = emails.get(attendeeKey(attendee));
      if (!email) return attendee;
      const status = rsvps.get(email);
      if (!status || status === attendee.status) return attendee;
      return { ...attendee, status };
    });
    if (
      nextAttendees.every(
        (attendee, index) => attendee.status === parsed.attendees[index]?.status,
      )
    ) {
      continue;
    }

    nextValues[fieldId] = stringifyInviteValue({
      ...parsed,
      googleOrganizerId: organizerId,
      attendees: nextAttendees,
    });
    wrote = true;
  }

  if (wrote) {
    await saveCustomFieldValues({
      entityType: input.entityType,
      recordId: input.recordId,
      values: nextValues,
      layoutId: input.layoutId,
    });
  }

  return nextValues;
}
