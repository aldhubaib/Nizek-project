import { describe, expect, it } from "vitest";
import { cleanActionConfig } from "../../src/lib/workflow/actions";

describe("send invite action config", () => {
  it("keeps the chosen calendar field", () => {
    expect(cleanActionConfig("send_invite", { field: "fld_kickoff" })).toEqual({
      field: "fld_kickoff",
    });
    expect(cleanActionConfig("send_invite", {})).toEqual({ field: "" });
  });
});
