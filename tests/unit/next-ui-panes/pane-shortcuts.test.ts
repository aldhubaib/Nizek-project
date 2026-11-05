// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { paneKeyAction, type PaneKeyEvent } from "@/next-ui/panes/pane-shortcuts";

function key(partial: Partial<PaneKeyEvent>): PaneKeyEvent {
  return {
    code: "",
    key: "",
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    target: null,
    ...partial,
  };
}

function el(tag: string, attrs: Record<string, string> = {}, editable = false): Element {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  // jsdom does not compute `isContentEditable` from the attribute; browsers do
  if (editable) Object.defineProperty(node, "isContentEditable", { value: true });
  return node;
}

describe("the keyboard map", () => {
  it("⌥1–⌥8 activate a tray entry (0-based)", () => {
    expect(paneKeyAction(key({ altKey: true, code: "Digit1", key: "¡" }))).toEqual({ type: "activate", index: 0 });
    expect(paneKeyAction(key({ altKey: true, code: "Digit8", key: "•" }))).toEqual({ type: "activate", index: 7 });
    expect(paneKeyAction(key({ altKey: true, code: "Digit9" }))).toBeNull();
  });

  it("⌥W closes, ⌥⇧S swaps, Esc is reported for the caller to place", () => {
    expect(paneKeyAction(key({ altKey: true, code: "KeyW", key: "∑" }))).toEqual({ type: "close" });
    expect(paneKeyAction(key({ altKey: true, shiftKey: true, code: "KeyS", key: "Í" }))).toEqual({ type: "swap" });
    expect(paneKeyAction(key({ altKey: true, code: "KeyS" }))).toBeNull();
    expect(paneKeyAction(key({ key: "Escape", code: "Escape" }))).toEqual({ type: "escape" });
  });

  it("ignores ⌘ and Ctrl combinations and events something else already handled", () => {
    expect(paneKeyAction(key({ altKey: true, metaKey: true, code: "KeyW" }))).toBeNull();
    expect(paneKeyAction(key({ altKey: true, ctrlKey: true, code: "Digit1" }))).toBeNull();
    expect(paneKeyAction(key({ altKey: true, code: "KeyW", defaultPrevented: true }))).toBeNull();
  });

  it("does not fire inside inputs, textareas, selects or editable regions", () => {
    for (const target of [
      el("input"),
      el("textarea"),
      el("select"),
      el("div", {}, true),
      el("div", { role: "textbox" }),
      el("div", { role: "combobox" }),
    ]) {
      expect(paneKeyAction(key({ altKey: true, code: "KeyW", target }))).toBeNull();
      expect(paneKeyAction(key({ key: "Escape", target }))).toBeNull();
    }
    expect(paneKeyAction(key({ altKey: true, code: "KeyW", target: el("div") }))).toEqual({ type: "close" });
  });
});
