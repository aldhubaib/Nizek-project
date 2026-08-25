import { describe, expect, it } from "vitest";
import { mergeThreadMessages } from "@/lib/merge-thread-messages";

function msg(id: string, at: string, body = id) {
  return { id, createdAt: at, body };
}

describe("mergeThreadMessages", () => {
  it("keeps older cached pages when the server sends only the latest page", () => {
    const local = [
      msg("old", "2026-01-01T00:00:00.000Z"),
      msg("mid", "2026-01-01T00:01:00.000Z"),
      msg("new", "2026-01-01T00:02:00.000Z"),
    ];
    const server = [
      msg("mid", "2026-01-01T00:01:00.000Z"),
      msg("new", "2026-01-01T00:02:00.000Z", "edited"),
    ];
    const merged = mergeThreadMessages(local, server);
    expect(merged.map((m) => m.id)).toEqual(["old", "mid", "new"]);
    expect(merged.find((m) => m.id === "new")?.body).toBe("edited");
  });
});
