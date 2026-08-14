import { describe, expect, it } from "vitest";
import {
  wrapFirstPlainText,
  commentMarkTag,
  taskMarkTag,
} from "@/lib/html-annotate";
import { toMentionTokens } from "@/lib/note-mentions";
import { taskCode } from "@/lib/task-label";

describe("wrapFirstPlainText", () => {
  it("wraps the first plaintext occurrence", () => {
    const html = "<p>Ship the login flow this week</p>";
    const { open, close } = commentMarkTag("th1");
    expect(wrapFirstPlainText(html, "login flow", open, close)).toBe(
      `<p>Ship the ${open}login flow${close} this week</p>`,
    );
  });

  it("does not match text inside tags", () => {
    const html = '<p class="login flow">hello</p>';
    const { open, close } = commentMarkTag("th1");
    expect(wrapFirstPlainText(html, "login flow", open, close)).toBe(html);
  });

  it("wraps a task mark", () => {
    const { open, close } = taskMarkTag("task1");
    expect(wrapFirstPlainText("<p>Fix crash</p>", "Fix crash", open, close)).toContain(
      'data-task-id="task1"',
    );
  });
});

describe("toMentionTokens", () => {
  it("rewrites @Name to mention tokens", () => {
    const { body, mentionedIds } = toMentionTokens("Hey @Ada check this", [
      { id: "u1", name: "Ada" },
      { id: "u2", name: "Bob" },
    ]);
    expect(body).toBe("Hey @[Ada](u1) check this");
    expect(mentionedIds).toEqual(["u1"]);
  });
});

describe("taskCode", () => {
  it("pads the number", () => {
    expect(taskCode("FEATURE", 7)).toBe("F-007");
    expect(taskCode("REPORTED_BUG", 12)).toBe("RB-012");
  });
});
