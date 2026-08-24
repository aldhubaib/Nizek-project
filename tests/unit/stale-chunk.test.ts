import { describe, expect, it } from "vitest";
import { isStaleChunkError } from "@/lib/stale-chunk";

describe("isStaleChunkError", () => {
  it("detects a missing Turbopack module factory", () => {
    expect(
      isStaleChunkError({
        message:
          "Module [project]/src/actions/data:6f8882 was instantiated because it was required from module backlog-planner.tsx, but the module factory is not available.",
      }),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isStaleChunkError({ message: "Task not found" })).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});
