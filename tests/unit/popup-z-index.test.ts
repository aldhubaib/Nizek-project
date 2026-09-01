import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Base UI popups portal to <body>, so they are siblings of the app's opaque
 * full-screen overlays rather than children of whatever opened them. They need
 * a z-index above those overlays or they are painted behind the page and cannot
 * be clicked at all.
 *
 * This used to be a named `@utility popup-layer`, which compiled in the
 * production build but not under the dev server. The class was on the element
 * and looked right in the source, while the popups silently sat at `z-index:
 * auto` and swallowed every click. Only a built-in Tailwind utility is trusted
 * here, and tailwind-merge understands it, so a caller passing their own z-*
 * replaces it instead of colliding.
 */
const POPUP_LAYER = "z-[10000]";

const FILES = [
  "dialog.tsx",
  "dropdown-menu.tsx",
  "popover.tsx",
  "select.tsx",
  "tooltip.tsx",
];

function read(file: string): string {
  return readFileSync(path.join(process.cwd(), "src/components/ui", file), "utf8");
}

describe("Base UI popup z-index", () => {
  for (const file of FILES) {
    it(`${file} puts its popup on the shared layer`, () => {
      expect(read(file)).toContain(POPUP_LAYER);
    });
  }

  it("no popup falls back to the dead custom utility", () => {
    for (const file of FILES) {
      expect(read(file)).not.toContain("popup-layer");
    }
  });

  it("the dead utility is gone from the stylesheet", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).not.toContain("@utility popup-layer");
  });

  it("clears the opaque overlays it has to beat", () => {
    // The slide-over sits at 850 and the hand-rolled dialogs at 900; both paint
    // an opaque background, so a popup tying with them disappears.
    const layer = Number(POPUP_LAYER.replace(/\D/g, ""));
    expect(layer).toBeGreaterThan(900);
  });
});
