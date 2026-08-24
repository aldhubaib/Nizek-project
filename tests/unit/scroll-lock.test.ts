// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  canElementScrollInDirection,
  findScrollableAncestorInRoot,
  shouldAllowLockedScroll,
} from "@/hooks/use-scroll-lock";

function scroller(opts: {
  overflowY?: string;
  scrollHeight: number;
  clientHeight: number;
  scrollTop?: number;
}) {
  const el = document.createElement("div");
  el.style.overflowY = opts.overflowY ?? "auto";
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: opts.scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: opts.clientHeight });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    writable: true,
    value: opts.scrollTop ?? 0,
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
});
