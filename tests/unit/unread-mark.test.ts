import { describe, expect, it } from "vitest";
import { unreadMarkPlan } from "../../src/lib/unread-mark";

describe("unreadMarkPlan", () => {
  it("flags an existing cursor and leaves its read time alone", () => {
    expect(unreadMarkPlan({ hasCursor: true, clientRoomNeverOpened: false })).toBe("flag");
    expect(unreadMarkPlan({ hasCursor: true, clientRoomNeverOpened: true })).toBe("flag");
  });

  it("creates a cursor only when that cannot hide an already-unread client room", () => {
    expect(unreadMarkPlan({ hasCursor: false, clientRoomNeverOpened: false })).toBe("create");
    expect(unreadMarkPlan({ hasCursor: false, clientRoomNeverOpened: true })).toBe("skip");
  });
});
