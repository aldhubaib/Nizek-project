import { beforeEach, describe, expect, it } from "vitest";

import {
  activateAt,
  addRecent,
  pushEntry,
  removeAt,
  replaceAt,
  togglePin,
  usePaneStore,
} from "@/next-ui/panes/pane-store";

const projects = { kind: "projects" };
const vault = { kind: "vault" };
const project = { kind: "project", id: "a1" };

describe("pure transitions", () => {
  it("pushes on top, activates a repeat instead of duplicating, caps at eight", () => {
    let s = pushEntry({ stack: [], at: 0 }, projects);
    s = pushEntry(s, vault);
    expect(s).toEqual({ stack: [vault, projects], at: 0 });
    expect(pushEntry(s, projects)).toEqual({ stack: [vault, projects], at: 1 });
    for (let i = 0; i < 10; i++) s = pushEntry(s, { kind: "project", id: `x${i}` });
    expect(s.stack).toHaveLength(8);
    expect(s.stack[0]).toEqual({ kind: "project", id: "x9" });
  });

  it("a record's view is the same pane turned to another page: opening it turns the pane, recents keep one entry", () => {
    const roadmap = { kind: "project", id: "a1", view: "roadmap" };
    const s = pushEntry({ stack: [vault, project], at: 0 }, roadmap);
    expect(s).toEqual({ stack: [vault, roadmap], at: 1 });
    expect(pushEntry(s, project)).toEqual({ stack: [vault, project], at: 1 });
    expect(addRecent([project, vault], roadmap)).toEqual([roadmap, vault]);
    expect(replaceAt({ stack: [vault, project], at: 0 }, 0, roadmap)).toEqual({ stack: [roadmap], at: 0 });
  });

  it("removes and keeps the active index pointing at the same entry", () => {
    const s = { stack: [project, vault, projects], at: 2 };
    expect(removeAt(s, 0)).toEqual({ stack: [vault, projects], at: 1 }); // before the active one
    expect(removeAt(s, 2)).toEqual({ stack: [project, vault], at: 1 }); // the active one, last
    expect(removeAt({ stack: [projects], at: 0 }, 0)).toBeNull();
  });

  it("replaces the active entry in place and drops a copy elsewhere", () => {
    expect(replaceAt({ stack: [project, vault], at: 0 }, 0, projects)).toEqual({
      stack: [projects, vault],
      at: 0,
    });
    expect(replaceAt({ stack: [project, vault, projects], at: 0 }, 0, projects)).toEqual({
      stack: [projects, vault],
      at: 0,
    });
  });

  it("a pinned entry survives a full tray; the oldest unpinned one drops instead", () => {
    let s = pushEntry({ stack: [], at: 0 }, { kind: "project", id: "keep" });
    for (let i = 0; i < 7; i++) s = pushEntry(s, { kind: "project", id: `x${i}` });
    expect(s.stack).toHaveLength(8);
    s = pushEntry(s, { kind: "project", id: "new" }, ["project:keep"]);
    expect(s.stack).toHaveLength(8);
    expect(s.stack.at(-1)).toEqual({ kind: "project", id: "keep" });
    expect(s.stack.some((e) => e.id === "x0")).toBe(false);
    expect(togglePin(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePin(["a", "b"], "a")).toEqual(["b"]);
  });

  it("recents are newest first, without repeats, at most twelve", () => {
    let r = addRecent([], projects);
    r = addRecent(r, project);
    r = addRecent(r, projects);
    expect(r).toEqual([projects, project]);
    for (let i = 0; i < 20; i++) r = addRecent(r, { kind: "project", id: `r${i}` });
    expect(r).toHaveLength(12);
  });

  it("activates only indexes that exist", () => {
    const s = { stack: [project, vault], at: 0 };
    expect(activateAt(s, 1).at).toBe(1);
    expect(activateAt(s, 5).at).toBe(0);
  });
});

describe("the store writes the URL and reads it back", () => {
  const pushed: string[] = [];
  const replaced: string[] = [];
  beforeEach(() => {
    pushed.length = 0;
    replaced.length = 0;
    usePaneStore.getState().setNavigator({
      push: (h) => pushed.push(h),
      replace: (h) => replaced.push(h),
    });
    usePaneStore.getState().setLocation("/next/projects", "");
  });

  it("open pushes a history entry; the URL hydrates the stack", () => {
    usePaneStore.getState().open(projects);
    expect(pushed).toEqual(["/next/projects?pane=projects,at:0"]);
    usePaneStore.getState().setLocation("/next/projects", "?pane=projects,at:0");
    expect(usePaneStore.getState().stack).toEqual([projects]);
    usePaneStore.getState().open(project);
    expect(pushed[1]).toBe("/next/projects?pane=project:a1,projects,at:0");
  });

  it("opening an entry already in the tray only switches to it (replace)", () => {
    usePaneStore.getState().setLocation("/next/projects", "?pane=project:a1,projects,at:0");
    usePaneStore.getState().open(projects);
    expect(pushed).toEqual([]);
    expect(replaced).toEqual(["/next/projects?pane=project:a1,projects,at:1"]);
  });

  it("activate replaces, close and close all push, keeping the page's own params", () => {
    usePaneStore.getState().setLocation("/next/projects", "?status=late&pane=project:a1,projects,at:0");
    usePaneStore.getState().activate(1);
    expect(replaced).toEqual(["/next/projects?status=late&pane=project:a1,projects,at:1"]);
    usePaneStore.getState().close();
    expect(pushed).toEqual(["/next/projects?status=late&pane=projects,at:0"]);
    usePaneStore.getState().closeAll();
    expect(pushed[1]).toBe("/next/projects?status=late");
  });

  it("swap makes the side entry the path and the old path the side entry", () => {
    usePaneStore.getState().setLocation("/next/projects", "?pane=project:a1,vault,at:0");
    usePaneStore.getState().swap();
    expect(pushed).toEqual(["/next/projects/a1?pane=projects,vault,at:0"]);
  });

  it("close main: the visible side entry becomes the main pane, the rest of the tray stays, the page joins recents", () => {
    usePaneStore.getState().setLocation("/next/vault", "?pane=projects,at:0");
    usePaneStore.getState().closeMain();
    expect(pushed).toEqual(["/next/projects"]);
    expect(usePaneStore.getState().recents[0]).toEqual({ kind: "vault" });
    usePaneStore.getState().setLocation("/next/vault", "?pane=project:a1,projects,at:1");
    usePaneStore.getState().closeMain();
    expect(pushed[1]).toBe("/next/projects?pane=project:a1,at:0");
  });

  it("close main does nothing with no side pane or on a page that is not a pane kind", () => {
    for (const [p, q] of [
      ["/next/vault", ""],
      ["/next/projects/x/edit", "?pane=projects,at:0"],
    ]) {
      usePaneStore.getState().setLocation(p, q);
      usePaneStore.getState().closeMain();
    }
    expect(pushed).toEqual([]);
  });

  it("swap does nothing when the main pane is not a pane kind", () => {
    usePaneStore.getState().setLocation("/next/projects/x/edit", "?pane=project:a1,at:0");
    usePaneStore.getState().swap();
    expect(pushed).toEqual([]);
  });

  it("the dashboard swaps and closes like any section", () => {
    usePaneStore.getState().setLocation("/next", "?pane=projects,at:0");
    usePaneStore.getState().swap();
    expect(pushed).toEqual(["/next/projects?pane=dashboard,at:0"]);
  });

  it("opening an entry records it in recents; pins toggle", () => {
    usePaneStore.getState().clearRecents();
    usePaneStore.getState().open(project);
    expect(usePaneStore.getState().recents[0]).toEqual(project);
    usePaneStore.getState().togglePin("project:a1");
    expect(usePaneStore.getState().pins).toEqual(["project:a1"]);
    usePaneStore.getState().togglePin("project:a1");
    expect(usePaneStore.getState().pins).toEqual([]);
  });

  it("open full drops the query and goes to the record", () => {
    usePaneStore.getState().setLocation("/next/projects", "?pane=project:a1,at:0");
    usePaneStore.getState().openFull();
    expect(pushed).toEqual(["/next/projects/a1"]);
  });
});
