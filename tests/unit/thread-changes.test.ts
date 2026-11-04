import { describe, expect, it } from "vitest";
import {
  SYNC_OVERLAP_MS,
  applyThreadChanges,
  nextSyncCursor,
  threadSyncCursor,
} from "@/lib/thread-changes";

type M = { id: string; createdAt: string; updatedAt?: string; body: string; reactions?: string[] };

const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, s)).toISOString();
const msg = (id: string, created: number, updated?: number, body = id): M => ({
  id,
  createdAt: at(created),
  updatedAt: updated === undefined ? undefined : at(updated),
  body,
});

describe("threadSyncCursor", () => {
  it("is null with nothing loaded", () => {
    expect(threadSyncCursor([])).toBeNull();
  });

  it("takes the newest updatedAt (or createdAt) minus the overlap", () => {
    const list = [msg("a", 0, 50), msg("b", 10), msg("c", 20, 30)];
    expect(threadSyncCursor(list, 0)).toBe(at(50));
    expect(threadSyncCursor(list)).toBe(new Date(Date.parse(at(50)) - SYNC_OVERLAP_MS).toISOString());
  });

  it("nextSyncCursor backs off the server time by the overlap", () => {
    expect(nextSyncCursor(at(100), 10_000)).toBe(at(90));
  });
});

describe("applyThreadChanges", () => {
  const local = [msg("a", 0, 0), msg("b", 10, 10), msg("c", 20, 20)];

  it("returns the same array when nothing applies", () => {
    expect(applyThreadChanges(local, { messages: [], deletedIds: ["zzz"] })).toBe(local);
    // Same row, same updatedAt → nothing to do.
    expect(applyThreadChanges(local, { messages: [msg("b", 10, 10)], deletedIds: [] })).toBe(local);
  });

  it("removes deleted rows", () => {
    const out = applyThreadChanges(local, { messages: [], deletedIds: ["b"] });
    expect(out.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("replaces edited rows and keeps order by createdAt", () => {
    const out = applyThreadChanges(local, {
      messages: [msg("a", 0, 40, "edited a")],
      deletedIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(out[0].body).toBe("edited a");
    expect(out[0].updatedAt).toBe(at(40));
  });

  it("does not let an older server row overwrite newer local state", () => {
    const newerLocal = [msg("a", 0, 60, "newest")];
    const out = applyThreadChanges(newerLocal, {
      messages: [msg("a", 0, 40, "stale")],
      deletedIds: [],
    });
    expect(out).toBe(newerLocal);
  });

  it("appends new rows inside the loaded window, sorted", () => {
    const out = applyThreadChanges(local, {
      messages: [msg("e", 30, 30), msg("d", 15, 15)],
      deletedIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("skips unknown rows older than the loaded window (no gap for load-older)", () => {
    const out = applyThreadChanges(local, {
      messages: [msg("old", -100, 50, "edited long ago message")],
      deletedIds: [],
    });
    expect(out).toBe(local);
  });

  it("a deleted id in the change set wins over its row", () => {
    const out = applyThreadChanges(local, {
      messages: [msg("b", 10, 50)],
      deletedIds: ["b"],
    });
    expect(out.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("fills an empty list with everything", () => {
    const out = applyThreadChanges([], { messages: [msg("b", 10), msg("a", 0)], deletedIds: [] });
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
