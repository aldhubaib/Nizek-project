// Per-member read receipts. The old single "peer last read" timestamp made a
// group flip to "Seen" when ANY one member opened the chat — the team read
// that as "someone else cleared my notification".

import { describe, expect, it } from "vitest";
import {
  applyPeerRead,
  readersOf,
  receiptFor,
  seenByLabel,
  seenByMessageId,
} from "@/lib/read-receipts";

const T0 = "2026-01-01T10:00:00.000Z";
const T1 = "2026-01-01T10:05:00.000Z";
const T2 = "2026-01-01T10:10:00.000Z";

describe("applyPeerRead", () => {
  it("keeps the newest cursor per member", () => {
    let reads = applyPeerRead({}, "a", T1);
    reads = applyPeerRead(reads, "a", T0); // stale event arrives late
    expect(reads.a).toBe(T1);
    reads = applyPeerRead(reads, "a", T2);
    expect(reads.a).toBe(T2);
  });
  it("returns the same object when nothing changes", () => {
    const reads = { a: T1 };
    expect(applyPeerRead(reads, "a", T0)).toBe(reads);
  });
});

describe("receiptFor", () => {
  it("1:1 — read once the one peer's cursor passes the message", () => {
    expect(receiptFor({}, T0, 1)).toBe("sent");
    expect(receiptFor({ a: T0 }, T0, 1)).toBe("all");
    expect(receiptFor({ a: T0 }, T1, 1)).toBe("sent");
  });
  it("group — one reader is 'some', everyone is 'all'", () => {
    expect(receiptFor({ a: T1 }, T0, 3)).toBe("some");
    expect(receiptFor({ a: T1, b: T1 }, T0, 3)).toBe("some");
    expect(receiptFor({ a: T1, b: T1, c: T2 }, T0, 3)).toBe("all");
  });
  it("falls back to known members when the peer count is unknown", () => {
    expect(receiptFor({ a: T1 }, T0, 0)).toBe("all");
    expect(receiptFor({ a: T1, b: T0 }, T1, 0)).toBe("some");
  });
});

describe("readersOf / seenByMessageId", () => {
  const msgs = [
    { id: "m1", authorId: "me", createdAt: T0 },
    { id: "m2", authorId: "a", createdAt: T1 },
    { id: "m3", authorId: "me", createdAt: T2 },
  ];
  it("lists who has read a message", () => {
    expect(readersOf({ a: T1, b: T0 }, T1).sort()).toEqual(["a"]);
    expect(readersOf({ a: T1, b: T0 }, T0).sort()).toEqual(["a", "b"]);
  });
  it("picks the newest own message that anyone has read", () => {
    expect(seenByMessageId(msgs, { a: T1 }, "me")).toBe("m1");
    expect(seenByMessageId(msgs, { a: T2 }, "me")).toBe("m3");
    expect(seenByMessageId(msgs, {}, "me")).toBeNull();
  });
});

describe("seenByLabel", () => {
  const names = { a: "Ali", b: "Sara", c: "Omar", d: "Noor", e: "Huda" };
  it("formats one, two and three names", () => {
    expect(seenByLabel(["a"], names)).toBe("Seen by Ali");
    expect(seenByLabel(["a", "b"], names)).toBe("Seen by Ali and Sara");
    expect(seenByLabel(["a", "b", "c"], names)).toBe("Seen by Ali, Sara and Omar");
  });
  it("collapses the tail past three", () => {
    expect(seenByLabel(["a", "b", "c", "d"], names)).toBe(
      "Seen by Ali, Sara, Omar and 1 other",
    );
    expect(seenByLabel(["a", "b", "c", "d", "e"], names)).toBe(
      "Seen by Ali, Sara, Omar and 2 others",
    );
  });
  it("is null with no readers and tolerates unknown names", () => {
    expect(seenByLabel([], names)).toBeNull();
    expect(seenByLabel(["zz"], names)).toBe("Seen by Someone");
  });
});
