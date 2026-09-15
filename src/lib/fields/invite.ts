/**
 * Calendar invite field values. Stored on CustomFieldValue as JSON.
 * Filling the field does not send mail — the blueprint Send invite action does.
 */

import { isCountryCode } from "@/lib/countries";

export const INVITE_RSVP = [
  "needs_action",
  "accepted",
  "tentative",
  "declined",
] as const;

export type InviteRsvp = (typeof INVITE_RSVP)[number];

export const INVITE_PERSON_KINDS = ["user", "contact"] as const;
export type InvitePersonKind = (typeof INVITE_PERSON_KINDS)[number];

export type InviteAttendee = {
  kind: InvitePersonKind;
  id: string;
  status: InviteRsvp;
  sentAt: string | null;
};

export type InvitePlace = {
  location: string;
  lat: number | null;
  lng: number | null;
  placeId: string;
};

export type InviteValue = InvitePlace & {
  /** ISO 3166-1 alpha-2. When set, location search and pins stay in this country. */
  country: string;
  start: string;
  end: string;
  attendees: InviteAttendee[];
  uid: string;
  sequence: number;
  /** Google Calendar event id when Send invite created it on the organizer's calendar. */
  googleEventId: string;
  /** User who created the Google event — used to read guest RSVPs. */
  googleOrganizerId: string;
};

export const EMPTY_INVITE: InviteValue = {
  start: "",
  end: "",
  location: "",
  lat: null,
  lng: null,
  placeId: "",
  country: "",
  attendees: [],
  uid: "",
  sequence: 0,
  googleEventId: "",
  googleOrganizerId: "",
};

function parseCoord(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function parseCountry(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const code = raw.trim().toUpperCase();
  return isCountryCode(code) ? code : "";
}

export function inviteHasPin(value: Pick<InvitePlace, "lat" | "lng">): boolean {
  return value.lat != null && value.lng != null;
}

/** Google Maps link for a saved place or a typed address. */
export function inviteMapsUrl(value: InvitePlace): string {
  if (inviteHasPin(value)) {
    return `https://www.google.com/maps?q=${value.lat},${value.lng}`;
  }
  const query = value.location.trim();
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function isInviteRsvp(value: string): value is InviteRsvp {
  return (INVITE_RSVP as readonly string[]).includes(value);
}

export function isInvitePersonKind(value: string): value is InvitePersonKind {
  return (INVITE_PERSON_KINDS as readonly string[]).includes(value);
}

export function attendeeKey(attendee: Pick<InviteAttendee, "kind" | "id">): string {
  return `${attendee.kind}:${attendee.id}`;
}

function parseAttendee(raw: unknown): InviteAttendee | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as {
    kind?: unknown;
    id?: unknown;
    status?: unknown;
    sentAt?: unknown;
  };
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.kind !== "string" || !isInvitePersonKind(row.kind)) return null;
  return {
    kind: row.kind,
    id: row.id,
    status: typeof row.status === "string" && isInviteRsvp(row.status)
      ? row.status
      : "needs_action",
    sentAt: typeof row.sentAt === "string" && row.sentAt ? row.sentAt : null,
  };
}

export function parseInviteValue(raw: string | null | undefined): InviteValue {
  if (!raw || !raw.trim()) return { ...EMPTY_INVITE, attendees: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...EMPTY_INVITE, attendees: [] };
    }
    const row = parsed as {
      start?: unknown;
      end?: unknown;
      location?: unknown;
      lat?: unknown;
      lng?: unknown;
      placeId?: unknown;
      country?: unknown;
      attendees?: unknown;
      uid?: unknown;
      sequence?: unknown;
      googleEventId?: unknown;
      googleOrganizerId?: unknown;
    };
    const attendees = Array.isArray(row.attendees)
      ? row.attendees.flatMap((item) => {
          const attendee = parseAttendee(item);
          return attendee ? [attendee] : [];
        })
      : [];
    const seen = new Set<string>();
    const unique = attendees.filter((attendee) => {
      const key = attendeeKey(attendee);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const sequence =
      typeof row.sequence === "number" && Number.isFinite(row.sequence)
        ? Math.max(0, Math.floor(row.sequence))
        : 0;
    return {
      start: typeof row.start === "string" ? row.start : "",
      end: typeof row.end === "string" ? row.end : "",
      location: typeof row.location === "string" ? row.location : "",
      lat: parseCoord(row.lat, -90, 90),
      lng: parseCoord(row.lng, -180, 180),
      placeId: typeof row.placeId === "string" ? row.placeId : "",
      country: parseCountry(row.country),
      attendees: unique,
      uid: typeof row.uid === "string" ? row.uid : "",
      sequence,
      googleEventId:
        typeof row.googleEventId === "string" ? row.googleEventId : "",
      googleOrganizerId:
        typeof row.googleOrganizerId === "string" ? row.googleOrganizerId : "",
    };
  } catch {
    return { ...EMPTY_INVITE, attendees: [] };
  }
}

export function stringifyInviteValue(value: InviteValue): string {
  const lat = value.lat ?? null;
  const lng = value.lng ?? null;
  const placeId = value.placeId ?? "";
  const country = parseCountry(value.country);
  if (
    !value.start &&
    !value.end &&
    !value.location.trim() &&
    lat == null &&
    lng == null &&
    !placeId.trim() &&
    !country &&
    value.attendees.length === 0
  ) {
    return "";
  }
  return JSON.stringify({
    start: value.start,
    end: value.end,
    location: value.location,
    lat,
    lng,
    placeId,
    country,
    attendees: value.attendees,
    uid: value.uid,
    sequence: value.sequence,
    googleEventId: value.googleEventId ?? "",
    googleOrganizerId: value.googleOrganizerId ?? "",
  });
}

export function inviteFieldIsFilled(raw: string | null | undefined): boolean {
  const value = parseInviteValue(raw);
  return Boolean(value.start) && value.attendees.length > 0;
}

export function inviteHasBeenSent(value: InviteValue): boolean {
  return value.attendees.some((attendee) => Boolean(attendee.sentAt));
}

export function formatInviteWhen(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short value for cards and lists. */
export function formatInviteField(raw: string | null | undefined): string {
  const value = parseInviteValue(raw);
  if (!value.start && value.attendees.length === 0) return "";
  const when = formatInviteWhen(value.start);
  const count = value.attendees.length;
  const people =
    count === 0 ? "no people" : count === 1 ? "1 person" : `${count} people`;
  if (!when) return people;
  return `${when} · ${people}`;
}

export type InviteRsvpCounts = {
  yes: number;
  maybe: number;
  no: number;
  waiting: number;
};

export function countInviteRsvps(
  attendees: InviteAttendee[],
): InviteRsvpCounts {
  const counts: InviteRsvpCounts = { yes: 0, maybe: 0, no: 0, waiting: 0 };
  for (const row of attendees) {
    if (row.status === "accepted") counts.yes += 1;
    else if (row.status === "tentative") counts.maybe += 1;
    else if (row.status === "declined") counts.no += 1;
    else counts.waiting += 1;
  }
  return counts;
}

export function formatInviteFieldDetail(raw: string | null | undefined): string {
  const value = parseInviteValue(raw);
  if (!value.start && value.attendees.length === 0) return "";
  const when = formatInviteWhen(value.start);
  const { yes, maybe, no, waiting } = countInviteRsvps(value.attendees);
  const rsvp = inviteHasBeenSent(value)
    ? `Yes ${yes}, Maybe ${maybe}, No ${no}, Waiting ${waiting}`
    : `${value.attendees.length} invited (not sent)`;
  return [when, value.location.trim(), rsvp].filter(Boolean).join(" · ");
}

export function isoToDatetimeLocal(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function datetimeLocalToIso(local: string): string {
  if (!local.trim()) return "";
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function addHoursIso(iso: string, hours: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}
