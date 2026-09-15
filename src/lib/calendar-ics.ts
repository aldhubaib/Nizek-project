import { createHmac, timingSafeEqual } from "node:crypto";
import type { InvitePersonKind, InviteRsvp, InviteValue } from "@/lib/fields/invite";

export type InviteTokenPayload = {
  entityType: string;
  recordId: string;
  fieldId: string;
  kind: InvitePersonKind;
  personId: string;
};

function secret(): string {
  return process.env.BETTER_AUTH_SECRET || "nizek-invite-dev";
}

function b64url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

export function signInviteToken(payload: InviteTokenPayload): string {
  const body = [
    payload.entityType,
    payload.recordId,
    payload.fieldId,
    payload.kind,
    payload.personId,
  ].join("|");
  const encoded = b64url(body);
  const sig = createHmac("sha256", secret()).update(encoded).digest();
  return `${encoded}.${b64url(sig)}`;
}

export function verifyInviteToken(token: string): InviteTokenPayload | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = createHmac("sha256", secret()).update(encoded).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  const parts = fromB64url(encoded).split("|");
  if (parts.length !== 5) return null;
  const [entityType, recordId, fieldId, kind, personId] = parts;
  if (kind !== "user" && kind !== "contact") return null;
  if (!entityType || !recordId || !fieldId || !personId) return null;
  return { entityType, recordId, fieldId, kind, personId };
}

function icsDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return chunks.join("\r\n");
}

export function inviteUid(recordId: string, fieldId: string): string {
  return `${fieldId}-${recordId}@nizek`;
}

export function buildInviteIcs(input: {
  uid: string;
  sequence: number;
  title: string;
  location: string;
  lat?: number | null;
  lng?: number | null;
  description: string;
  start: string;
  end: string;
  organizerName: string;
  organizerEmail: string;
  attendeeEmail: string;
  attendeeName: string;
  status: InviteRsvp;
}): string {
  const start = icsDate(input.start);
  const end = icsDate(input.end || input.start);
  const stamp = icsDate(new Date().toISOString());
  const partstat =
    input.status === "accepted"
      ? "ACCEPTED"
      : input.status === "declined"
        ? "DECLINED"
        : input.status === "tentative"
          ? "TENTATIVE"
          : "NEEDS-ACTION";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nizek//Invite//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(input.title)}`,
    input.location ? `LOCATION:${icsEscape(input.location)}` : "",
    input.lat != null && input.lng != null
      ? `GEO:${input.lat};${input.lng}`
      : "",
    input.description ? `DESCRIPTION:${icsEscape(input.description)}` : "",
    `ORGANIZER;CN=${icsEscape(input.organizerName)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${icsEscape(input.attendeeName)};RSVP=TRUE;PARTSTAT=${partstat}:mailto:${input.attendeeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function inviteAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function rsvpUrl(token: string): string {
  return `${inviteAppUrl()}/invite/${encodeURIComponent(token)}`;
}

export function formatInviteValueForIcs(value: InviteValue): {
  start: string;
  end: string;
} {
  return {
    start: value.start,
    end: value.end || value.start,
  };
}
