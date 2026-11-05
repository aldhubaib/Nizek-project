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
  attendees: { kind: "user"; id: string }[],
): Promise<Map<string, string>> {
  const userIds = attendees.filter((row) => row.kind === "user").map((row) => row.id);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      })
    : [];
  const map = new Map<string, string>();
  for (const user of users) {
    if (user.email.trim()) map.set(`user:${user.id}`, user.email.trim().toLowerCase());
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
