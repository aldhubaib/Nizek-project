import { describe, expect, it } from "vitest";
import {
  conversationChannel,
  conversationClientChannel,
  globalPresenceChannel,
  isStaffOnlyChannel,
  parseConversationChannel,
  projectChannel,
  taskChannel,
  userChannel,
} from "@/lib/channels";

/**
 * The two conversation channels are the last line of defence: a client that
 * minted a token for the plain channel would receive unmasked staff names
 * straight from Centrifugo, bypassing every server-side mask. These tests pin
 * the parse and the audience rule the token route applies.
 */

describe("parseConversationChannel", () => {
  it("reads the staff channel as staff-only", () => {
    expect(parseConversationChannel("c123")).toEqual({
      conversationId: "c123",
      forClient: false,
    });
  });

  it("strips the suffix off the client twin", () => {
    expect(parseConversationChannel("c123-client")).toEqual({
      conversationId: "c123",
      forClient: true,
    });
  });

  it("round-trips both builders", () => {
    expect(
      parseConversationChannel(conversationChannel("abc").slice("conv:".length)),
    ).toEqual({ conversationId: "abc", forClient: false });
    expect(
      parseConversationChannel(
        conversationClientChannel("abc").slice("conv:".length),
      ),
    ).toEqual({ conversationId: "abc", forClient: true });
  });

  it("rejects a channel with no conversation id", () => {
    expect(parseConversationChannel("")).toBeNull();
    expect(parseConversationChannel("-client")).toBeNull();
  });

  it("keeps a hyphenated id intact", () => {
    expect(parseConversationChannel("proj-1-thread")).toEqual({
      conversationId: "proj-1-thread",
      forClient: false,
    });
  });
});

describe("conversation channel audience gate", () => {
  // Mirrors the `forClient !== isClientUser(user)` check in the token route.
  const allowed = (channelBody: string, isClient: boolean) => {
    const parsed = parseConversationChannel(channelBody);
    if (!parsed) return false;
    return parsed.forClient === isClient;
  };

  it("denies a client the unmasked channel", () => {
    expect(allowed("c1", true)).toBe(false);
  });

  it("grants a client only the masked twin", () => {
    expect(allowed("c1-client", true)).toBe(true);
  });

  it("grants staff the unmasked channel and denies them the client twin", () => {
    expect(allowed("c1", false)).toBe(true);
    expect(allowed("c1-client", false)).toBe(false);
  });
});

describe("isStaffOnlyChannel", () => {
  /**
   * Task and project feeds are published unmasked. A client is a project member,
   * so the token route's membership check would happily sign them a token — this
   * rule is what stops it, and the route applies it before anything else.
   */
  it("covers the feeds that carry real names", () => {
    expect(isStaffOnlyChannel(projectChannel("p1"))).toBe(true);
    expect(isStaffOnlyChannel(taskChannel("t1"))).toBe(true);
  });

  it("leaves the channels a client legitimately needs alone", () => {
    expect(isStaffOnlyChannel(conversationClientChannel("c1"))).toBe(false);
    expect(isStaffOnlyChannel(userChannel("u1"))).toBe(false);
    expect(isStaffOnlyChannel(globalPresenceChannel())).toBe(false);
  });

  it("is not fooled by an id that starts with a staff namespace", () => {
    expect(isStaffOnlyChannel("conv:project-1")).toBe(false);
    expect(isStaffOnlyChannel("projects:p1")).toBe(false);
    expect(isStaffOnlyChannel("project")).toBe(true);
  });
});
