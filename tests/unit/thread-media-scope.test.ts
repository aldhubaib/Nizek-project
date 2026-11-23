import { describe, expect, it } from "vitest";
import { threadScopeSql } from "@/lib/mobile/thread-media-scope";

describe("threadScopeSql", () => {
  it("scopes project threads to project messages without a conversation", () => {
    const sql = threadScopeSql({ projectId: "p1" });
    expect(sql).not.toBeNull();
    expect(sql?.values).toEqual(["p1"]);
  });

  it("scopes conversation and task threads", () => {
    expect(threadScopeSql({ conversationId: "c1" })?.values).toEqual(["c1"]);
    expect(threadScopeSql({ taskId: "t1" })?.values).toEqual(["t1"]);
  });

  it("returns null for an empty target", () => {
    expect(threadScopeSql({})).toBeNull();
  });
});
