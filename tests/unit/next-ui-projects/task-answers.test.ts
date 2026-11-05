import { describe, expect, it } from "vitest";

import { isAnswered, parseAnswer } from "@/next-ui/screens/projects/task-answers";

describe("a task's stored answers", () => {
  it("reads text, links and blanks", () => {
    expect(parseAnswer({ type: "text" }, "Two sprints")).toEqual({ kind: "text", text: "Two sprints" });
    expect(parseAnswer({ type: "textarea" }, "  ")).toEqual({ kind: "empty" });
    expect(parseAnswer({ type: "link" }, "https://x.y")).toEqual({ kind: "link", url: "https://x.y" });
    expect(isAnswered(parseAnswer({ type: "text" }, null))).toBe(false);
  });

  it("reads files as name::url pairs", () => {
    expect(parseAnswer({ type: "file" }, "a.png::https://f/a.png|||b.pdf::https://f/b.pdf")).toEqual({
      kind: "files",
      files: [
        { name: "a.png", url: "https://f/a.png" },
        { name: "b.pdf", url: "https://f/b.pdf" },
      ],
    });
    expect(parseAnswer({ type: "file" }, "legacy-name-only")).toEqual({ kind: "files", files: [{ name: "legacy-name-only", url: "" }] });
  });

  it("reads a multi-select as its choices, and a single legacy value as one choice", () => {
    expect(parseAnswer({ type: "select", multiple: true }, '["iOS","Android"]')).toEqual({ kind: "choices", values: ["iOS", "Android"] });
    expect(parseAnswer({ type: "select", multiple: true }, "Web")).toEqual({ kind: "choices", values: ["Web"] });
    expect(parseAnswer({ type: "select", multiple: true }, "[]")).toEqual({ kind: "empty" });
    expect(parseAnswer({ type: "select", multiple: false }, "Web")).toEqual({ kind: "text", text: "Web" });
  });

  it("reads a client question's state", () => {
    expect(parseAnswer({ type: "client" }, "")).toEqual({ kind: "empty" });
    expect(parseAnswer({ type: "client" }, '{"needed":false}')).toMatchObject({ kind: "client", needed: false, completed: false });
    expect(parseAnswer({ type: "client" }, '{"needed":true,"note":"logo files","completed":true,"completedAt":"2026-02-01T00:00:00.000Z"}')).toEqual({
      kind: "client",
      needed: true,
      note: "logo files",
      completed: true,
      completedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(parseAnswer({ type: "client" }, "not json")).toEqual({ kind: "empty" });
  });
});
