import "server-only";

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { saveCustomFieldValues } from "@/actions/custom-field";
import { createAndPublishNotifications } from "@/lib/notify";
import {
  attendeeKey,
  inviteMapsUrl,
  parseInviteValue,
  stringifyInviteValue,
  type InviteValue,
} from "@/lib/fields/invite";
import {
  buildInviteIcs,
  inviteAppUrl,
  inviteUid,
  rsvpUrl,
  signInviteToken,
} from "@/lib/calendar-ics";
import { upsertGoogleCalendarEvent } from "@/lib/google-calendar";
import { configSetField } from "@/lib/workflow/actions";
import type { WorkflowActionDef } from "@/lib/workflow/types";
import type { WorkflowEntityType } from "@/lib/workflow/types";

type Organizer = { id: string; name: string; email: string };

function fromAddress(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    "Nizek <onboarding@resend.dev>"
  );
}

function organizerMailto(organizer: Organizer): string {
  return organizer.email.trim() || "noreply@nizek.com";
}

async function resolvePeople(
  value: InviteValue,
): Promise<
  Map<
    string,
    { name: string; email: string; imageUrl: string | null; userId: string | null }
  >
> {
  const userIds = value.attendees
    .filter((row) => row.kind === "user")
    .map((row) => row.id);
  const contactIds = value.attendees
    .filter((row) => row.kind === "contact")
    .map((row) => row.id);
  const [users, contacts] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, imageUrl: true },
        })
      : Promise.resolve([]),
    contactIds.length
      ? prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: {
            id: true,
            title: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const map = new Map<
    string,
    { name: string; email: string; imageUrl: string | null; userId: string | null }
  >();
  for (const user of users) {
    map.set(`user:${user.id}`, {
      name: user.name?.trim() || user.email,
      email: user.email,
      imageUrl: user.imageUrl,
      userId: user.id,
    });
  }
  for (const contact of contacts) {
    const name =
      contact.title.trim() ||
      `${contact.firstName} ${contact.lastName}`.trim() ||
      contact.email ||
      "Contact";
    map.set(`contact:${contact.id}`, {
      name,
      email: contact.email?.trim() || "",
      imageUrl: null,
      userId: null,
    });
  }
  return map;
}

async function sendOneEmail(input: {
  to: string;
  title: string;
  when: string;
  location: string;
  mapsUrl: string;
  organizerName: string;
  rsvpLink: string;
  ics: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("RESEND_API_KEY is missing, so the invite email cannot be sent");
  }
  const resend = new Resend(key);
  const lines = [
    `${input.organizerName} invited you to ${input.title}.`,
    input.when ? `When: ${input.when}` : "",
    input.location ? `Where: ${input.location}` : "",
    input.mapsUrl ? input.mapsUrl : "",
    "",
    `Yes / Maybe / No: ${input.rsvpLink}`,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: input.to,
    subject: `Invitation: ${input.title}`,
    text: lines.join("\n"),
    attachments: [
      {
        filename: "invite.ics",
        content: Buffer.from(input.ics, "utf8"),
        contentType: "text/calendar; method=REQUEST; charset=UTF-8",
      },
    ],
  });
  if (error) throw new Error(error.message);
}

export async function dispatchSendInviteActions(input: {
  actions: WorkflowActionDef[];
  entityType: WorkflowEntityType;
  recordId: string;
  recordTitle: string;
  fields: { id: string; type: string; label: string }[];
  values: Record<string, string>;
  organizer: Organizer;
  linkUrl: string;
  layoutId?: string | null;
}): Promise<void> {
  const inviteActions = input.actions.filter((action) => action.type === "send_invite");
  if (inviteActions.length === 0) return;

  const nextValues = { ...input.values };
  let wrote = false;
  const notifyUserIds = new Set<string>();

  const seenFields = new Set<string>();
  for (const action of inviteActions) {
    const fieldId = configSetField(action.config).field;
    if (!fieldId || seenFields.has(fieldId)) continue;
    seenFields.add(fieldId);
    const field = input.fields.find((row) => row.id === fieldId);
    if (!field || field.type !== "invite") continue;

    const parsed = parseInviteValue(nextValues[fieldId] ?? "");
    if (!parsed.start || parsed.attendees.length === 0) continue;

    const people = await resolvePeople(parsed);
    const uid = parsed.uid || inviteUid(input.recordId, fieldId);
    const sequence = parsed.sequence + 1;
    const title = field.label.trim() || input.recordTitle;
    const when = new Date(parsed.start).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const sentAt = new Date().toISOString();
    const nextAttendees = [...parsed.attendees];
    const mapsUrl = inviteMapsUrl(parsed);
    const recordUrl = `${inviteAppUrl()}${input.linkUrl.startsWith("/") ? "" : "/"}${input.linkUrl}`;
    const guestEmails: string[] = [];

    for (const attendee of nextAttendees) {
      const person = people.get(attendeeKey(attendee));
      if (!person) continue;
      if (!person.email) {
        throw new Error(`${person.name} has no email, so the invite cannot be sent`);
      }
      const email = person.email.trim();
      if (
        email &&
        !guestEmails.some((row) => row.toLowerCase() === email.toLowerCase())
      ) {
        guestEmails.push(email);
      }
      if (person.userId) notifyUserIds.add(person.userId);
    }

    const calendar = await upsertGoogleCalendarEvent(input.organizer.id, {
      eventId: parsed.googleEventId,
      summary: title,
      description: [input.recordTitle, mapsUrl, recordUrl]
        .filter(Boolean)
        .join("\n"),
      location: parsed.location,
      startIso: parsed.start,
      endIso: parsed.end || parsed.start,
      attendeeEmails: guestEmails,
      sourceUrl: recordUrl,
    });

    if (calendar) {
      for (let i = 0; i < nextAttendees.length; i += 1) {
        const person = people.get(attendeeKey(nextAttendees[i]));
        if (!person?.email) continue;
        nextAttendees[i] = { ...nextAttendees[i], sentAt };
      }
      nextValues[fieldId] = stringifyInviteValue({
        ...parsed,
        uid,
        sequence,
        googleEventId: calendar.eventId,
        googleOrganizerId: input.organizer.id,
        attendees: nextAttendees,
      });
      wrote = true;
      continue;
    }

    for (let i = 0; i < nextAttendees.length; i += 1) {
      const attendee = nextAttendees[i];
      const person = people.get(attendeeKey(attendee));
      if (!person) continue;
      const token = signInviteToken({
        entityType: input.entityType,
        recordId: input.recordId,
        fieldId,
        kind: attendee.kind,
        personId: attendee.id,
      });
      const rsvp = rsvpUrl(token);
      await sendOneEmail({
        to: person.email,
        title,
        when,
        location: parsed.location,
        mapsUrl,
        organizerName: input.organizer.name || input.organizer.email,
        rsvpLink: rsvp,
        ics: buildInviteIcs({
          uid,
          sequence,
          title,
          location: parsed.location,
          lat: parsed.lat,
          lng: parsed.lng,
          description: [input.recordTitle, mapsUrl, rsvp]
            .filter(Boolean)
            .join("\n"),
          start: parsed.start,
          end: parsed.end || parsed.start,
          organizerName: input.organizer.name || input.organizer.email,
          organizerEmail: organizerMailto(input.organizer),
          attendeeEmail: person.email,
          attendeeName: person.name,
          status: attendee.status,
        }),
      });
      nextAttendees[i] = { ...attendee, sentAt };
    }

    nextValues[fieldId] = stringifyInviteValue({
      ...parsed,
      uid,
      sequence,
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

  const recipients = [...notifyUserIds];
  if (recipients.length > 0) {
    await createAndPublishNotifications({
      recipientIds: recipients,
      type: "calendar_invite",
      title: `You're invited: ${input.recordTitle}`,
      body: "Open the record to see the time, or use the link in your email to reply.",
      linkUrl: input.linkUrl,
    });
  }
}
