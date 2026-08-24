// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { shouldHideChromeOnScroll } from "@/hooks/use-hide-header-on-scroll";

describe("shouldHideChromeOnScroll", () => {
  it("hides chrome for a tall page scroller", () => {
    const page = document.createElement("div");
    Object.defineProperty(page, "clientHeight", { value: window.innerHeight });
    document.body.appendChild(page);
    expect(shouldHideChromeOnScroll(page)).toBe(true);
    page.remove();
  });

  it("does not hide chrome for scroll inside a slide-over", () => {
    const root = document.createElement("div");
    root.setAttribute("data-scroll-lock-root", "");
    root.setAttribute("data-slide-over", "");
    const body = document.createElement("div");
    Object.defineProperty(body, "clientHeight", { value: window.innerHeight });
    root.appendChild(body);
    document.body.appendChild(root);
    expect(shouldHideChromeOnScroll(body)).toBe(false);
    root.remove();
  });

  it("does not hide chrome while the page scroll lock is on", () => {
    const page = document.createElement("div");
    Object.defineProperty(page, "clientHeight", { value: window.innerHeight });
    document.body.appendChild(page);
    document.documentElement.setAttribute("data-scroll-locked", "");
    expect(shouldHideChromeOnScroll(page)).toBe(false);
    document.documentElement.removeAttribute("data-scroll-locked");
    page.remove();
  });
});
