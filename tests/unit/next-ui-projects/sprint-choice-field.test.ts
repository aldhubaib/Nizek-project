// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DECISION_AS_DESCRIBED } from "@/lib/sprint-plan-choices";

/**
 * Decision and Risk as two buttons: nothing pressed at first; the "nothing" button stores its
 * sentence at once; the "something" button opens a box whose words are saved as typed; a saved
 * value finds its button again; read-only, the choice is a mark.
 */

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.innerHTML = "";
});

const NONE = { label: "As described", text: DECISION_AS_DESCRIBED };
const SOME = { label: "Different decision", placeholder: "What was decided instead?" };

async function mount(props: { value: string; editable?: boolean; missing?: boolean; onCommit?: (t: string) => void; onType?: (t: string) => void }) {
  const { ChoiceField } = await import("@/next-ui/screens/projects/sprint-doc-cards");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = (value: string) =>
    act(async () => {
      root!.render(
        React.createElement(ChoiceField, {
          id: "decision-t1",
          label: "Decision",
          required: true,
          value,
          none: NONE,
          some: SOME,
          editable: props.editable ?? true,
          missing: props.missing ?? value.trim() === "",
          onCommit: props.onCommit ?? (() => {}),
          onType: props.onType ?? (() => {}),
          testId: "sprint-decision",
        }),
      );
    });
  await render(props.value);
  return render;
}

const radios = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
const box = () => host.querySelector<HTMLTextAreaElement>('[data-testid="sprint-decision-text"]');
const click = (el: Element | null) => act(async () => el?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("ChoiceField", () => {
  it("starts with nothing pressed and no box, marked as missing", async () => {
    await mount({ value: "" });
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(box()).toBeNull();
    expect(host.querySelector('[data-testid="sprint-decision"]')?.getAttribute("data-choice")).toBe("unset");
    expect(radios()[0].className).toContain("border-destructive");
  });

  it("stores the stock sentence at once when the 'nothing' button is pressed", async () => {
    const onCommit = vi.fn();
    const onType = vi.fn();
    const render = await mount({ value: "", onCommit, onType });
    await click(radios()[0]);
    expect(onCommit).toHaveBeenCalledWith(DECISION_AS_DESCRIBED);
    expect(onType).not.toHaveBeenCalled();
    // the saved value comes back and the button stays pressed, still no box
    await render(DECISION_AS_DESCRIBED);
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(box()).toBeNull();
    expect(host.querySelector('[data-testid="sprint-decision"]')?.getAttribute("data-choice")).toBe("none");
  });

  it("opens an empty box when 'something' is pressed, clears a stock sentence, and saves the words as typed", async () => {
    const onCommit = vi.fn();
    const onType = vi.fn();
    const render = await mount({ value: DECISION_AS_DESCRIBED, onCommit, onType });
    await click(radios()[1]);
    expect(onCommit).toHaveBeenCalledWith("");
    await render("");
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    const area = box();
    expect(area).not.toBeNull();
    expect(area?.value).toBe("");
    expect(document.activeElement).toBe(area);
    // typing goes to the debounced save; the box keeps the words
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(area, "Ship it behind a flag.");
      area!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onType).toHaveBeenCalledWith("Ship it behind a flag.");
    await render("Ship it behind a flag.");
    expect(box()?.value).toBe("Ship it behind a flag.");
    expect(host.querySelector('[data-testid="sprint-decision"]')?.getAttribute("data-choice")).toBe("some");
  });

  it("finds the button for a value written elsewhere, and never steals focus for it", async () => {
    await mount({ value: "Build it in-house." });
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    expect(box()?.value).toBe("Build it in-house.");
    expect(document.activeElement).not.toBe(box());
  });

  it("read-only, shows the choice as a mark with the words under it, or that nothing was chosen", async () => {
    await mount({ value: "Build it in-house.", editable: false });
    expect(radios()).toHaveLength(0);
    expect(box()).toBeNull();
    expect(host.textContent).toContain("Different decision");
    expect(host.textContent).toContain("Build it in-house.");

    await act(async () => root!.unmount());
    root = null;
    document.body.innerHTML = "";
    await mount({ value: DECISION_AS_DESCRIBED, editable: false });
    expect(host.textContent).toContain("As described");
    expect(host.textContent).not.toContain(DECISION_AS_DESCRIBED);

    await act(async () => root!.unmount());
    root = null;
    document.body.innerHTML = "";
    await mount({ value: "", editable: false });
    expect(host.textContent).toContain("Not chosen yet.");
  });
});
