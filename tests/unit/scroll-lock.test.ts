// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  canElementScrollInDirection,
  findScrollableAncestorInRoot,
  shouldAllowLockedScroll,
} from "@/hooks/use-scroll-lock";

function scroller(opts: {
  overflowY?: string;
  overflowX?: string;
  scrollHeight?: number;
  clientHeight?: number;
  scrollTop?: number;
  scrollWidth?: number;
  clientWidth?: number;
  scrollLeft?: number;
}) {
  const el = document.createElement("div");
  el.style.overflowY = opts.overflowY ?? "auto";
  if (opts.overflowX) el.style.overflowX = opts.overflowX;
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    value: opts.scrollHeight ?? 100,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    value: opts.clientHeight ?? 100,
  });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    writable: true,
    value: opts.scrollTop ?? 0,
  });
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    value: opts.scrollWidth ?? opts.clientWidth ?? 100,
  });
  Object.defineProperty(el, "clientWidth", {
    configurable: true,
    value: opts.clientWidth ?? 100,
  });
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    writable: true,
    value: opts.scrollLeft ?? 0,
  });
  return el;
}

function lockRoot() {
  const root = document.createElement("div");
  root.setAttribute("data-scroll-lock-root", "");
  document.body.appendChild(root);
  return root;
}

describe("canElementScrollInDirection", () => {
  it("blocks when content fits", () => {
    const el = scroller({ scrollHeight: 100, clientHeight: 100, scrollTop: 0 });
    expect(canElementScrollInDirection(el, 10)).toBe(false);
    expect(canElementScrollInDirection(el, -10)).toBe(false);
  });

  it("allows down only until the bottom", () => {
    const el = scroller({ scrollHeight: 400, clientHeight: 200, scrollTop: 0 });
    expect(canElementScrollInDirection(el, 20)).toBe(true);
    expect(canElementScrollInDirection(el, -20)).toBe(false);
    el.scrollTop = 200;
    expect(canElementScrollInDirection(el, 20)).toBe(false);
    expect(canElementScrollInDirection(el, -20)).toBe(true);
  });
});

describe("shouldAllowLockedScroll", () => {
  it("blocks events outside a lock root", () => {
    const page = scroller({ scrollHeight: 2000, clientHeight: 400 });
    document.body.appendChild(page);
    expect(shouldAllowLockedScroll(page, 40)).toBe(false);
    page.remove();
  });

  it("blocks the dimmed peek even when a sibling scroller exists", () => {
    const root = lockRoot();
    const backdrop = document.createElement("button");
    const body = scroller({ scrollHeight: 800, clientHeight: 400 });
    root.append(backdrop, body);
    expect(shouldAllowLockedScroll(backdrop, 40)).toBe(false);
    expect(shouldAllowLockedScroll(body, 40)).toBe(true);
    root.remove();
  });

  it("blocks overscroll chaining once the panel hits the end", () => {
    const root = lockRoot();
    const body = scroller({ scrollHeight: 800, clientHeight: 400, scrollTop: 400 });
    const child = document.createElement("p");
    body.appendChild(child);
    root.appendChild(body);
    expect(findScrollableAncestorInRoot(child, root)).toBe(body);
    expect(shouldAllowLockedScroll(child, 30)).toBe(false);
    expect(shouldAllowLockedScroll(child, -30)).toBe(true);
    root.remove();
  });

  it("lets the panel body take over after a nested list hits the end", () => {
    const root = lockRoot();
    const body = scroller({ scrollHeight: 800, clientHeight: 400, scrollTop: 0 });
    const nested = scroller({ scrollHeight: 300, clientHeight: 120, scrollTop: 180 });
    const child = document.createElement("p");
    nested.appendChild(child);
    body.appendChild(nested);
    root.appendChild(body);
    expect(shouldAllowLockedScroll(child, 30)).toBe(true);
    body.scrollTop = 400;
    expect(shouldAllowLockedScroll(child, 30)).toBe(false);
    root.remove();
  });

  it("allows any gesture inside data-allow-overflow-x", () => {
    const root = lockRoot();
    const board = document.createElement("div");
    board.setAttribute("data-allow-overflow-x", "");
    const child = document.createElement("p");
    board.appendChild(child);
    root.appendChild(board);
    expect(shouldAllowLockedScroll(child, 40, 0)).toBe(true);
    expect(shouldAllowLockedScroll(child, 0, 40)).toBe(true);
    root.remove();
  });

  it("allows a horizontal swipe on an overflow-x board", () => {
    const root = lockRoot();
    const board = scroller({
      overflowY: "hidden",
      overflowX: "auto",
      scrollWidth: 2000,
      clientWidth: 400,
      scrollLeft: 0,
    });
    const child = document.createElement("p");
    board.appendChild(child);
    root.appendChild(board);
    expect(shouldAllowLockedScroll(child, 0, 40)).toBe(true);
    expect(shouldAllowLockedScroll(child, 0, -40)).toBe(false);
    board.scrollLeft = 1600;
    expect(shouldAllowLockedScroll(child, 0, 40)).toBe(false);
    expect(shouldAllowLockedScroll(child, 0, -40)).toBe(true);
    root.remove();
  });
});
