// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

/**
 * The two columns of the pane layout: a side pane opens at half and half, the handle moves
 * them while it is open, and the next side pane starts at half again. Opening must not ask
 * the group for a two-column layout before it knows the second column (that threw
 * "Invalid 1 panel layout").
 */

const h = React.createElement;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// a 1200 × 800 group: the library sizes the columns from the element's box
const rect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, toJSON() {} });
class ResizeObserverStub {
  cb: (entries: unknown[]) => void;
  constructor(cb: (entries: unknown[]) => void) {
    this.cb = cb;
  }
  observe(el: Element) {
    queueMicrotask(() => this.cb([{ target: el, contentRect: rect(), borderBoxSize: [{ inlineSize: 1200, blockSize: 800 }], contentBoxSize: [{ inlineSize: 1200, blockSize: 800 }] }]));
  }
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
Element.prototype.getBoundingClientRect = rect as never;
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { get: () => 1200, configurable: true });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { get: () => 800, configurable: true });
// a desktop window
window.matchMedia = ((q: string) => ({ matches: q.includes("1024") || q.includes("768"), media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;

// the URL the layout reads; the test moves it
type Entry = { kind: string; id?: string };
let location = { pathname: "/next/projects", search: "", href: "/next/projects", side: false, stack: [] as Entry[], at: -1 };
vi.mock("@/next-ui/panes/use-pane-location", () => ({ usePaneLocation: () => location }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));
vi.mock("@/next-ui/panes/pane-store", () => ({ usePaneStore: { getState: () => ({ setNavigator() {}, setLocation() {} }) } }));
vi.mock("@/next-ui/panes/pane", () => ({ Pane: ({ side, children }: { side: boolean; children?: React.ReactNode }) => h("div", { "data-pane": side ? "side" : "main" }, children) }));
vi.mock("@/next-ui/panes/pane-router", () => ({ PaneRouter: () => h("div", null, "side content") }));
vi.mock("@/next-ui/panes/pane-tray", () => ({ PaneTray: () => null }));
vi.mock("@/next-ui/panes/pane-sheet", () => ({ PaneSheet: () => null }));
vi.mock("@/next-ui/panes/pane-drawer", () => ({ PaneDrawer: () => null }));
vi.mock("@/next-ui/panes/pane-shortcuts", () => ({ PaneShortcuts: () => null }));
vi.mock("@/next-ui/panes/pane-title", () => ({ PaneTitle: () => null }));
vi.mock("@/next-ui/panes/pane-url", () => ({ mountKey: (e: Entry) => `${e.kind}:${e.id ?? ""}` }));

const CLOSED = { ...location };
const open = (id: string) => ({ ...location, stack: [{ kind: "task", id }], at: 0, side: true });

const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));
/** The columns as `[id, share]`, the share being the flex-grow the library wrote (a percentage). */
const columns = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>("[data-panel]")].map((p) => [p.id, Math.round(Number(p.style.flexGrow))] as const);

describe("the pane columns", () => {
  it("open at half and half, follow the handle while open, and start at half again next time", async () => {
    const { PaneLayout } = await import("@/next-ui/panes/pane-layout");
    const errors: unknown[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host, { onUncaughtError: (e) => errors.push(e), onCaughtError: (e) => errors.push(e) });
    const render = () => act(async () => root.render(h(PaneLayout, null, h("p", null, "page"))));

    location = CLOSED;
    await render();
    await settle();
    expect(columns(host).map(([id]) => id)).toEqual(["main"]);

    // a side pane opens: two columns, half each
    location = open("t1");
    await render();
    await settle();
    let c = columns(host);
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual(["main", 50]);
    expect(c[1][1]).toBe(50);
    const firstSideId = c[1][0];

    // the user drags the handle to the right: the page column grows
    const handle = host.querySelector<HTMLElement>("[data-separator]")!;
    const pointer = (type: string, x: number, target: EventTarget) =>
      act(async () => {
        const Ctor = window.PointerEvent ?? window.MouseEvent;
        target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: 400, pointerId: 1, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1 } as PointerEventInit));
      });
    await pointer("pointermove", 600, handle);
    await pointer("pointerdown", 600, handle);
    await pointer("pointermove", 840, document.body);
    await pointer("pointerup", 840, document.body);
    await settle();
    c = columns(host);
    expect(c[0][1]).toBeGreaterThan(50);
    expect(c[1][1]).toBeLessThan(50);

    // closed, then another side pane opens: half and half again, under a new column id, so
    // the drag remembered for the first column cannot come back
    location = CLOSED;
    await render();
    await settle();
    expect(columns(host)).toEqual([["main", 100]]);
    location = open("t2");
    await render();
    await settle();
    c = columns(host);
    expect(c).toHaveLength(2);
    expect(c[1][0]).not.toBe(firstSideId);
    expect(c[0]).toEqual(["main", 50]);
    expect(c[1][1]).toBe(50);

    await act(async () => root.unmount());
    expect(errors).toEqual([]);
  });
});
