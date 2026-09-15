import "server-only";

import { prisma } from "@/lib/prisma";
import { googleAccountHasCalendarScope } from "@/lib/google-calendar-scope";
import type { InviteRsvp } from "@/lib/fields/invite";

export {
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  googleAccountHasCalendarScope,
} from "@/lib/google-calendar-scope";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const EXPIRY_SKEW_MS = 60_000;

export async function projectUsesCalendarInvite(
  projectId: string,
): Promise<boolean> {
  const [field, action] = await Promise.all([
    prisma.customField.findFirst({
      where: {
        type: "invite",
        layout: { projectId },
      },
      select: { id: true },
    }),
    prisma.workflowAction.findFirst({
      where: {
        type: "send_invite",
        OR: [
          { status: { workflow: { projectId } } },
          { transition: { workflow: { projectId } } },
        ],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(field || action);
}

export async function userIsOnCalendarInviteProject(
  userId: string | undefined | null,
): Promise<boolean> {
  if (!userId) return false;
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const projectIds = [...new Set(memberships.map((row) => row.projectId))];
  if (projectIds.length === 0) return false;

  const [field, action] = await Promise.all([
    prisma.customField.findFirst({
      where: {
        type: "invite",
        layout: { projectId: { in: projectIds } },
      },
      select: { id: true },
    }),
    prisma.workflowAction.findFirst({
      where: {
        type: "send_invite",
        OR: [
          { status: { workflow: { projectId: { in: projectIds } } } },
          { transition: { workflow: { projectId: { in: projectIds } } } },
        ],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(field || action);
}

async function googleTokenScope(accessToken: string): Promise<string | null> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { scope?: unknown };
  return typeof payload.scope === "string" && payload.scope.trim()
    ? payload.scope
    : null;
}

export async function userHasGoogleCalendarAccess(
  userId: string | undefined | null,
): Promise<boolean> {
  if (!userId) return false;
  const account = await loadGoogleAccount(userId);
  if (!account) return false;
  if (!account.accessToken && !account.refreshToken) return false;
  if (googleAccountHasCalendarScope(account.scope)) return true;

  // Better Auth updates tokens on sign-in but only writes `scope` via
  // linkSocial. After Connect, the live Google token can already have
  // Calendar while Account.scope is still email/profile.
  const accessToken =
    tokenStillValid(account) ?? (await refreshGoogleAccessToken(account));
  if (!accessToken) return false;
  const liveScope = await googleTokenScope(accessToken);
  if (!googleAccountHasCalendarScope(liveScope)) return false;
  await prisma.account.update({
    where: { id: account.id },
    data: { scope: liveScope },
  });
  return true;
}

type GoogleAccount = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string | null;
};

async function loadGoogleAccount(userId: string): Promise<GoogleAccount | null> {
  return prisma.account.findFirst({
    where: { userId, providerId: "google" },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
      accessTokenExpiresAt: true,
      scope: true,
    },
  });
}

function tokenStillValid(account: GoogleAccount): string | null {
  if (!account.accessToken) return null;
  const expires = account.accessTokenExpiresAt?.getTime() ?? 0;
  if (expires && expires <= Date.now() + EXPIRY_SKEW_MS) return null;
  return account.accessToken;
}

async function refreshGoogleAccessToken(
  account: GoogleAccount,
): Promise<string | null> {
  const refreshToken = account.refreshToken?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!refreshToken || !clientId || !clientSecret) return null;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[google-calendar] token refresh failed", response.status, detail);
    return null;
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
    refresh_token?: unknown;
  };
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) return null;

  const expiresIn =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 3600;
  const nextRefresh =
    typeof payload.refresh_token === "string" && payload.refresh_token.trim()
      ? payload.refresh_token
      : undefined;
  const nextScope =
    typeof payload.scope === "string" && payload.scope.trim()
      ? payload.scope
      : undefined;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      ...(nextRefresh ? { refreshToken: nextRefresh } : {}),
      ...(nextScope ? { scope: nextScope } : {}),
    },
  });
  return accessToken;
}

async function googleAccessTokenForUser(userId: string): Promise<string | null> {
  const account = await loadGoogleAccount(userId);
  if (!account) return null;
  const current =
    tokenStillValid(account) ?? (await refreshGoogleAccessToken(account));
  if (!current) return null;
  if (googleAccountHasCalendarScope(account.scope)) return current;
  const liveScope = await googleTokenScope(current);
  if (!googleAccountHasCalendarScope(liveScope)) return null;
  await prisma.account.update({
    where: { id: account.id },
    data: { scope: liveScope },
  });
  return current;
}

export type GoogleCalendarEventInput = {
  eventId?: string | null;
  summary: string;
  description: string;
  location: string;
  startIso: string;
  endIso: string;
  attendeeEmails: string[];
  sourceUrl?: string;
};

function eventBody(input: GoogleCalendarEventInput) {
  const start = new Date(input.startIso);
  const end = new Date(input.endIso || input.startIso);
  const safeEnd =
    Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()
      ? new Date(start.getTime() + 60 * 60 * 1000)
      : end;

  return {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location.trim() || undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: safeEnd.toISOString() },
    attendees: input.attendeeEmails.map((email) => ({ email })),
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: true,
    ...(input.sourceUrl
      ? { source: { title: "Nizek", url: input.sourceUrl } }
      : {}),
  };
}

async function calendarRequest(
  accessToken: string,
  method: "POST" | "PATCH",
  eventId: string | undefined,
  body: ReturnType<typeof eventBody>,
): Promise<Response> {
  const url = eventId
    ? `${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=all`
    : `${EVENTS_URL}?sendUpdates=all`;
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Create or update an event on the user's primary calendar and email guests
 * through Google (Gmail invite card). Returns null when Calendar is not
 * connected or the API rejects the request.
 */
export async function upsertGoogleCalendarEvent(
  userId: string,
  input: GoogleCalendarEventInput,
): Promise<{ eventId: string } | null> {
  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) return null;

  let accessToken = await googleAccessTokenForUser(userId);
  if (!accessToken) return null;

  const body = eventBody(input);
  let eventId = input.eventId?.trim() || "";
  let response = eventId
    ? await calendarRequest(accessToken, "PATCH", eventId, body)
    : await calendarRequest(accessToken, "POST", undefined, body);

  if (response.status === 404 && eventId) {
    eventId = "";
    response = await calendarRequest(accessToken, "POST", undefined, body);
  }

  if (response.status === 401) {
    const account = await loadGoogleAccount(userId);
    const refreshed = account ? await refreshGoogleAccessToken(account) : null;
    if (!refreshed) return null;
    accessToken = refreshed;
    response = eventId
      ? await calendarRequest(accessToken, "PATCH", eventId, body)
      : await calendarRequest(accessToken, "POST", undefined, body);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[google-calendar] event failed", response.status, detail);
    return null;
  }

  const payload = (await response.json()) as { id?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  return id ? { eventId: id } : null;
}

function rsvpFromGoogleStatus(status: string | undefined): InviteRsvp {
  if (status === "accepted") return "accepted";
  if (status === "declined") return "declined";
  if (status === "tentative") return "tentative";
  return "needs_action";
}

/** Email (lowercase) → RSVP from the organizer's Google Calendar event. */
export async function getGoogleCalendarAttendeeRsvps(
  userId: string,
  eventId: string,
): Promise<Map<string, InviteRsvp> | null> {
  const id = eventId.trim();
  if (!id) return null;
  const accessToken = await googleAccessTokenForUser(userId);
  if (!accessToken) return null;

  const response = await fetch(
    `${EVENTS_URL}/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    attendees?: { email?: unknown; responseStatus?: unknown }[];
  };
  const map = new Map<string, InviteRsvp>();
  for (const row of payload.attendees ?? []) {
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    if (!email) continue;
    map.set(
      email,
      rsvpFromGoogleStatus(
        typeof row.responseStatus === "string" ? row.responseStatus : "",
      ),
    );
  }
  return map;
}
