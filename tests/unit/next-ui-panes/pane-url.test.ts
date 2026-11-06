import { describe, expect, it } from "vitest";

import {
  entryFromHref,
  hrefFromEntry,
  isAppHref,
  mountKey,
  paneParamOf,
  parentEntry,
  parsePane,
  sectionOf,
  serializePane,
  viewKey,
  withPane,
} from "@/next-ui/panes/pane-url";

describe("pane grammar", () => {
  it("round-trips a stack of sections and records", () => {
    const value = "project:abc123,vault,projects,at:1";
    const state = parsePane(value);
    expect(state).toEqual({
      stack: [{ kind: "project", id: "abc123" }, { kind: "vault" }, { kind: "projects" }],
      at: 1,
    });
    expect(serializePane(state)).toBe(value);
  });

  it("rejects malformed values instead of guessing", () => {
    expect(parsePane(null)).toBeNull();
    expect(parsePane("")).toBeNull();
    expect(parsePane("projects")).toBeNull(); // no at:
    expect(parsePane("at:0")).toBeNull(); // empty stack
    expect(parsePane("projects,at:x")).toBeNull();
    expect(parsePane("nope,at:0")).toBeNull(); // unknown kind
    expect(parsePane("projects:a=b,at:0")).toBeNull(); // a section query must be encoded
    expect(parsePane("project,at:0")).toBeNull(); // a record needs an id
    expect(parsePane("project:a/b,at:0")).toBeNull(); // id outside the safe alphabet
  });

  it("clamps the index, drops repeats and caps the stack at eight", () => {
    expect(parsePane("projects,vault,at:9")?.at).toBe(1);
    expect(parsePane("projects,projects,at:0")?.stack).toHaveLength(1);
    const many = Array.from({ length: 10 }, (_, i) => `project:${i}`).join(",");
    expect(parsePane(`${many},at:0`)?.stack).toHaveLength(8);
  });

  it("serialises an empty state to null", () => {
    expect(serializePane(null)).toBeNull();
    expect(serializePane({ stack: [], at: 0 })).toBeNull();
  });
});

describe("hrefs and entries (under /next until the switch)", () => {
  it("maps section and record paths both ways", () => {
    expect(entryFromHref("/next/projects")).toEqual({ kind: "projects" });
    expect(entryFromHref("/next/projects/abc?x=1#top")).toEqual({ kind: "project", id: "abc" });
    expect(hrefFromEntry({ kind: "project", id: "abc" })).toBe("/next/projects/abc");
    expect(hrefFromEntry({ kind: "vault" })).toBe("/next/vault");
    expect(entryFromHref("/next/equity/new")).toEqual({ kind: "portfolio", id: "new" });
  });

  it("the dashboard is the front door: `/next` itself", () => {
    expect(entryFromHref("/next")).toEqual({ kind: "dashboard" });
    expect(entryFromHref("/next/")).toEqual({ kind: "dashboard" });
    expect(hrefFromEntry({ kind: "dashboard" })).toBe("/next");
    expect(mountKey({ kind: "dashboard" })).toBe("dashboard");
  });

  it("leaves everything that is not a pane alone", () => {
    expect(entryFromHref("/dashboard/projects")).toBeNull(); // the live panel
    expect(entryFromHref("/projects")).toBeNull(); // outside /next
    expect(entryFromHref("/next/vault/abc")).toBeNull(); // vault has no record kind
    expect(entryFromHref("/next/projects/abc/edit")).toBeNull();
    expect(entryFromHref("/nextdoor")).toBeNull();
    expect(isAppHref("/next")).toBe(true);
    expect(isAppHref("/next/projects?x=1")).toBe(true);
    expect(isAppHref("/nextdoor")).toBe(false);
    expect(isAppHref("/dashboard")).toBe(false);
  });

  it("knows the section of a record", () => {
    expect(sectionOf("project")).toBe("projects");
    expect(sectionOf("thread")).toBe("messages");
    expect(sectionOf("portfolio")).toBe("equity");
    expect(sectionOf("vault")).toBe("vault");
    expect(sectionOf("nope")).toBeUndefined();
  });

  it("maps a project's views as the record turned to a page, in the path and in the pane grammar", () => {
    expect(entryFromHref("/next/projects/p1/roadmap")).toEqual({ kind: "project", id: "p1", view: "roadmap" });
    expect(entryFromHref("/next/projects/p1/settings")).toEqual({ kind: "project", id: "p1", view: "settings" });
    expect(hrefFromEntry({ kind: "project", id: "p1", view: "sprint" })).toBe("/next/projects/p1/sprint");
    expect(hrefFromEntry({ kind: "project", id: "p1" })).toBe("/next/projects/p1");
    // an unknown view is not a pane; a view on a kind without views is ignored
    expect(entryFromHref("/next/projects/p1/board")).toBeNull();
    expect(hrefFromEntry({ kind: "portfolio", id: "c1", view: "roadmap" })).toBe("/next/equity/c1");
    // the pane grammar carries the view as a third part; unknown views are malformed
    expect(parsePane("project:p1:roadmap,at:0")).toEqual({ stack: [{ kind: "project", id: "p1", view: "roadmap" }], at: 0 });
    expect(serializePane({ stack: [{ kind: "project", id: "p1", view: "notes" }, { kind: "projects" }], at: 1 })).toBe(
      "project:p1:notes,projects,at:1",
    );
    expect(parsePane("project:p1:board,at:0")).toBeNull();
    expect(parsePane("projects:status%3Dlate:roadmap,at:0")).toBeNull();
    // the same record in two views is one pane in the stack
    expect(parsePane("project:p1:roadmap,project:p1,at:1")).toEqual({
      stack: [{ kind: "project", id: "p1", view: "roadmap" }],
      at: 0,
    });
    // a record keeps its mount across its views; the scroll key tells them apart
    expect(mountKey({ kind: "project", id: "p1", view: "roadmap" })).toBe("project:p1");
    expect(viewKey({ kind: "project", id: "p1", view: "roadmap" })).toBe("project:p1:roadmap");
    expect(viewKey({ kind: "project", id: "p1" })).toBe("project:p1");
  });

  it("maps the administrator's pages as the admin section's own views, with an empty query slot in the grammar", () => {
    expect(entryFromHref("/next/admin/teams")).toEqual({ kind: "admin", view: "teams" });
    expect(entryFromHref("/next/admin/teams?q=web")).toEqual({ kind: "admin", id: "q=web", view: "teams" });
    expect(entryFromHref("/next/admin/nothing")).toBeNull();
    expect(hrefFromEntry({ kind: "admin", view: "teams" })).toBe("/next/admin/teams");
    expect(hrefFromEntry({ kind: "admin", id: "q=web", view: "teams" })).toBe("/next/admin/teams?q=web");
    expect(hrefFromEntry({ kind: "admin" })).toBe("/next/admin");
    expect(serializePane({ stack: [{ kind: "admin", view: "teams" }], at: 0 })).toBe("admin::teams,at:0");
    expect(parsePane("admin::teams,at:0")).toEqual({ stack: [{ kind: "admin", view: "teams" }], at: 0 });
    expect(parsePane("admin:q%3Dweb:teams,at:0")).toEqual({ stack: [{ kind: "admin", id: "q=web", view: "teams" }], at: 0 });
    expect(parsePane("admin::nothing,at:0")).toBeNull();
    expect(parsePane("admin:,at:0")).toBeNull();
    // one admin pane in the stack, kept mounted across its pages
    expect(parsePane("admin::teams,admin,at:0")).toEqual({ stack: [{ kind: "admin", view: "teams" }], at: 0 });
    expect(mountKey({ kind: "admin", view: "teams" })).toBe("admin");
    expect(viewKey({ kind: "admin", view: "teams" })).toBe("admin:teams");
  });

  it("maps a project's tasks, notes and sprints as child records, their pane id the two ids joined", () => {
    expect(entryFromHref("/next/projects/p1/tasks/t9")).toEqual({ kind: "task", id: "p1_t9" });
    expect(entryFromHref("/next/projects/p1/notes/n2")).toEqual({ kind: "note", id: "p1_n2" });
    expect(entryFromHref("/next/projects/p1/sprints/s1")).toEqual({ kind: "sprint", id: "p1_s1" });
    expect(hrefFromEntry({ kind: "task", id: "p1_t9" })).toBe("/next/projects/p1/tasks/t9");
    expect(hrefFromEntry({ kind: "note", id: "p1_n2" })).toBe("/next/projects/p1/notes/n2");
    expect(hrefFromEntry({ kind: "sprint", id: "p1_s1" })).toBe("/next/projects/p1/sprints/s1");
    expect(sectionOf("task")).toBe("projects");
    expect(sectionOf("note")).toBe("projects");
    expect(sectionOf("sprint")).toBe("projects");
    // an unknown segment, or an id that would break the join, is not a pane
    expect(entryFromHref("/next/projects/p1/files/f1")).toBeNull();
    expect(entryFromHref("/next/projects/p_1/tasks/t9")).toBeNull();
    // and the grammar carries them in the side stack
    expect(parsePane("task:p1_t9,projects,at:0")).toEqual({ stack: [{ kind: "task", id: "p1_t9" }, { kind: "projects" }], at: 0 });
    expect(serializePane({ stack: [{ kind: "note", id: "p1_n2" }], at: 0 })).toBe("note:p1_n2,at:0");
  });

  it("names the project a child record lives under, so its breadcrumb reads Projects › project › record", () => {
    expect(parentEntry({ kind: "sprint", id: "p1_s1" })).toEqual({ kind: "project", id: "p1" });
    expect(parentEntry({ kind: "task", id: "p1_t9" })).toEqual({ kind: "project", id: "p1" });
    expect(parentEntry({ kind: "note", id: "p1_n2" })).toEqual({ kind: "project", id: "p1" });
    expect(hrefFromEntry(parentEntry({ kind: "sprint", id: "p1_s1" })!)).toBe("/next/projects/p1");
    // a project, a section, or a child id that does not split has nothing above it
    expect(parentEntry({ kind: "project", id: "p1" })).toBeUndefined();
    expect(parentEntry({ kind: "projects" })).toBeUndefined();
    expect(parentEntry({ kind: "sprint", id: "broken" })).toBeUndefined();
  });
});

describe("withPane", () => {
  it("adds, replaces and removes the pane query without touching other params", () => {
    expect(withPane("/next/projects", "projects,at:0")).toBe("/next/projects?pane=projects,at:0");
    expect(withPane("/next/projects?status=late", "vault,at:0")).toBe(
      "/next/projects?status=late&pane=vault,at:0",
    );
    expect(withPane("/next/projects?status=late&pane=old,at:0", "project:x,at:0")).toBe(
      "/next/projects?status=late&pane=project:x,at:0",
    );
    expect(withPane("/next/projects?pane=vault,at:0&status=late", null)).toBe("/next/projects?status=late");
    expect(withPane("/next/projects?pane=vault,at:0", null)).toBe("/next/projects");
    expect(withPane("/next/projects#x", "vault,at:0")).toBe("/next/projects?pane=vault,at:0#x");
  });

  it("reads the pane value back from a search string, encoded or not", () => {
    expect(paneParamOf("?tab=a&pane=project:x,at:0")).toBe("project:x,at:0");
    expect(paneParamOf("pane=project%3Ax%2Cat%3A0")).toBe("project:x,at:0");
    expect(paneParamOf("?tab=a")).toBeNull();
  });
});

describe("sections with their own page query (filters, tabs)", () => {
  it("round-trips a query as the section's id, encoded so : , & survive", () => {
    const e = entryFromHref("/next/projects?status=late&team=request:abc");
    expect(e).toEqual({ kind: "projects", id: "status=late&team=request%3Aabc" });
    const s = serializePane({ stack: [e!, { kind: "project", id: "ab12" }], at: 0 });
    expect(s).toBe("projects:status%253Dlate%2526team%253Drequest%25253Aabc,project:ab12,at:0");
    // one URL decode later (what URLSearchParams hands back) it parses to the same entry
    expect(parsePane(decodeURIComponent(s!))).toEqual({ stack: [e, { kind: "project", id: "ab12" }], at: 0 });
    expect(hrefFromEntry(e!)).toBe("/next/projects?status=late&team=request%3Aabc");
  });

  it("ignores the pane param itself", () => {
    expect(entryFromHref("/next/projects?pane=vault,at:0")).toEqual({ kind: "projects" });
  });
});

describe("mountKey", () => {
  it("keeps a section mounted across its own query, but remounts per record", () => {
    expect(mountKey({ kind: "projects", id: "status=late" })).toBe("projects");
    expect(mountKey({ kind: "projects" })).toBe("projects");
    expect(mountKey({ kind: "project", id: "a" })).toBe("project:a");
    expect(mountKey({ kind: "project", id: "b" })).not.toBe(mountKey({ kind: "project", id: "a" }));
  });
});
