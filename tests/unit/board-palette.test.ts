import { describe, it, expect } from "vitest";
import {
  BOARD_COLORS,
  BOARD_ICONS,
  DEFAULT_BOARD_COLOR,
  DEFAULT_BOARD_ICON,
  boardColor,
  isBoardColor,
  isBoardIcon,
} from "@/lib/board-palette";
import { boardIconComponent } from "@/components/boards/board-icon";

describe("board colours", () => {
  it("falls back rather than rendering an uncoloured element", () => {
    expect(boardColor("not-a-colour").id).toBe(DEFAULT_BOARD_COLOR);
    expect(boardColor(null).id).toBe(DEFAULT_BOARD_COLOR);
    expect(boardColor(undefined).id).toBe(DEFAULT_BOARD_COLOR);
  });

  it("has the default in the palette", () => {
    expect(isBoardColor(DEFAULT_BOARD_COLOR)).toBe(true);
  });

  it("uses distinct ids", () => {
    const ids = BOARD_COLORS.map((color) => color.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("spells every class out rather than interpolating a stem", () => {
    // Tailwind only emits classes it can find written out in the source, so a
    // class assembled from a variable would compile to nothing. Catching a `${`
    // here is cheaper than noticing an uncoloured board in review.
    for (const color of BOARD_COLORS) {
      for (const value of [color.dot, color.text, color.border, color.soft]) {
        expect(value).not.toContain("${");
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("gives each swatch the class prefix its slot needs", () => {
    for (const color of BOARD_COLORS) {
      expect(color.dot.startsWith("bg-")).toBe(true);
      expect(color.text.startsWith("text-")).toBe(true);
      expect(color.border.startsWith("border-")).toBe(true);
      expect(color.soft.startsWith("bg-")).toBe(true);
    }
  });
});

describe("board icons", () => {
  it("resolves every name the palette offers", () => {
    // The stored value is looked up in a component map at render time, so a
    // name in the list with no component behind it would crash the row it is on.
    for (const name of BOARD_ICONS) {
      expect(boardIconComponent(name)).toBeDefined();
    }
  });

  it("has a real entry for each name, not a silent fallback", () => {
    // The check above would pass even if the map were empty, since every miss
    // returns the default. A name offered in the picker that quietly draws the
    // default icon instead is the actual failure to catch.
    const fallback = boardIconComponent(DEFAULT_BOARD_ICON);
    for (const name of BOARD_ICONS) {
      if (name === DEFAULT_BOARD_ICON) continue;
      expect(boardIconComponent(name)).not.toBe(fallback);
    }
  });

  it("falls back for an unknown or missing name", () => {
    expect(boardIconComponent("NotAnIcon")).toBe(boardIconComponent(DEFAULT_BOARD_ICON));
    expect(boardIconComponent(null)).toBe(boardIconComponent(DEFAULT_BOARD_ICON));
  });

  it("has the default in the list", () => {
    expect(isBoardIcon(DEFAULT_BOARD_ICON)).toBe(true);
  });

  it("rejects a name outside the list", () => {
    expect(isBoardIcon("Skull")).toBe(false);
  });
});
