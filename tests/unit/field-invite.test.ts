import { describe, expect, it } from "vitest";
import {
  EMPTY_INVITE,
  countInviteRsvps,
  inviteFieldIsFilled,
  inviteMapsUrl,
  parseInviteValue,
  stringifyInviteValue,
} from "../../src/lib/fields/invite";
import {
  buildInviteIcs,
  signInviteToken,
  verifyInviteToken,
} from "../../src/lib/calendar-ics";

describe("calendar invite field", () => {
  it("needs a start time and at least one person", () => {
    expect(inviteFieldIsFilled("")).toBe(false);
    expect(
      inviteFieldIsFilled(
        stringifyInviteValue({
          ...EMPTY_INVITE,
          start: "2026-09-14T07:00:00.000Z",
        }),
      ),
    ).toBe(false);
    expect(
      inviteFieldIsFilled(
        stringifyInviteValue({
          ...EMPTY_INVITE,
          start: "2026-09-14T07:00:00.000Z",
          end: "2026-09-14T08:00:00.000Z",
          location: "Office",
          attendees: [
            { kind: "user", id: "u1", status: "needs_action", sentAt: null },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("keeps attendee RSVP through a round trip", () => {
    const raw = stringifyInviteValue({
      ...EMPTY_INVITE,
      start: "2026-09-14T07:00:00.000Z",
      end: "2026-09-14T08:00:00.000Z",
      location: "Nizek",
      attendees: [
        {
          kind: "contact",
          id: "c1",
          status: "accepted",
          sentAt: "2026-09-14T06:00:00.000Z",
        },
      ],
      uid: "abc@nizek",
      sequence: 2,
    });
    const parsed = parseInviteValue(raw);
    expect(parsed.attendees[0]?.status).toBe("accepted");
    expect(parsed.sequence).toBe(2);
    expect(parsed.googleEventId).toBe("");
  });

  it("keeps a Google Calendar event id through a round trip", () => {
    const raw = stringifyInviteValue({
      ...EMPTY_INVITE,
      start: "2026-09-14T07:00:00.000Z",
      googleEventId: "abc123event",
    });
    expect(parseInviteValue(raw).googleEventId).toBe("abc123event");
  });

  it("keeps a map pin through a round trip", () => {
    const raw = stringifyInviteValue({
      ...EMPTY_INVITE,
      location: "Nizek",
      lat: 29.3759,
      lng: 47.9774,
      placeId: "ChIJtest",
    });
    const parsed = parseInviteValue(raw);
    expect(parsed.lat).toBe(29.3759);
    expect(parsed.lng).toBe(47.9774);
    expect(parsed.placeId).toBe("ChIJtest");
    expect(inviteMapsUrl(parsed)).toBe(
      "https://www.google.com/maps?q=29.3759,47.9774",
    );
  });

  it("reads old invites that only stored a location string", () => {
    const parsed = parseInviteValue(
      JSON.stringify({
        start: "",
        end: "",
        location: "Office",
        attendees: [],
        uid: "",
        sequence: 0,
      }),
    );
    expect(parsed.location).toBe("Office");
    expect(parsed.lat).toBeNull();
    expect(parsed.lng).toBeNull();
    expect(parsed.placeId).toBe("");
    expect(parsed.country).toBe("");
    expect(inviteMapsUrl(parsed)).toContain("query=Office");
  });

  it("keeps a country through a round trip", () => {
    const raw = stringifyInviteValue({
      ...EMPTY_INVITE,
      country: "kw",
      location: "Nizek",
    });
    const parsed = parseInviteValue(raw);
    expect(parsed.country).toBe("KW");
    expect(JSON.parse(raw).country).toBe("KW");
  });

  it("drops unknown country codes", () => {
    const parsed = parseInviteValue(
      JSON.stringify({
        ...EMPTY_INVITE,
        country: "XX",
        location: "Office",
      }),
    );
    expect(parsed.country).toBe("");
  });
});

describe("invite tokens and ics", () => {
  it("round-trips a signed RSVP token", () => {
    const payload = {
      entityType: "deal",
      recordId: "d1",
      fieldId: "f1",
      kind: "user" as const,
      personId: "u1",
    };
    const token = signInviteToken(payload);
    expect(verifyInviteToken(token)).toEqual(payload);
    expect(verifyInviteToken(token + "x")).toBeNull();
  });

  it("builds a REQUEST calendar file", () => {
    const ics = buildInviteIcs({
      uid: "f1-d1@nizek",
      sequence: 1,
      title: "Kickoff",
      location: "Office",
      lat: 29.3759,
      lng: 47.9774,
      description: "See you there",
      start: "2026-09-14T07:00:00.000Z",
      end: "2026-09-14T08:00:00.000Z",
      organizerName: "Nizek",
      organizerEmail: "hello@nizek.com",
      attendeeEmail: "a@example.com",
      attendeeName: "Alex",
      status: "needs_action",
    });
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SUMMARY:Kickoff");
    expect(ics).toContain("mailto:a@example.com");
    expect(ics).toContain("GEO:29.3759;47.9774");
    expect(ics).toContain("LOCATION:Office");
  });
});

describe("countInviteRsvps", () => {
  it("tallies yes, maybe, no, and waiting", () => {
    expect(
      countInviteRsvps([
        { kind: "user", id: "u1", status: "accepted", sentAt: "2026-09-14T06:00:00.000Z" },
        { kind: "user", id: "u2", status: "tentative", sentAt: "2026-09-14T06:00:00.000Z" },
        { kind: "contact", id: "c1", status: "declined", sentAt: "2026-09-14T06:00:00.000Z" },
        { kind: "contact", id: "c2", status: "needs_action", sentAt: "2026-09-14T06:00:00.000Z" },
        { kind: "user", id: "u3", status: "accepted", sentAt: "2026-09-14T06:00:00.000Z" },
      ]),
    ).toEqual({ yes: 2, maybe: 1, no: 1, waiting: 1 });
  });
});
