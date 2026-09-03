import { describe, expect, it } from "vitest";
import {
  SCROLL_END_TOLERANCE,
  hasReachedEnd,
  needsAcceptance,
} from "@/lib/client-agreement-gate";

describe("needsAcceptance", () => {
  it("gates nobody while nothing is published", () => {
    // The safety-critical default. An install that has never published, or a
    // lookup that came back empty, must not lock every client out of the chat
    // over a document that does not exist.
    expect(needsAcceptance(null, null)).toBe(false);
    expect(needsAcceptance(undefined, null)).toBe(false);
    expect(needsAcceptance(null, { versionId: "v1" })).toBe(false);
  });

  it("gates someone who has accepted nothing", () => {
    expect(needsAcceptance({ id: "v1" }, null)).toBe(true);
    expect(needsAcceptance({ id: "v1" }, undefined)).toBe(true);
  });

  it("lets through someone who accepted the version in force", () => {
    expect(needsAcceptance({ id: "v1" }, { versionId: "v1" })).toBe(false);
  });

  it("re-gates someone whose acceptance is for a superseded version", () => {
    // The whole mechanism behind publishing: the old row is left alone and
    // simply stops matching, so no acceptance has to be deleted or rewritten.
    expect(needsAcceptance({ id: "v2" }, { versionId: "v1" })).toBe(true);
  });
});

describe("hasReachedEnd", () => {
  it("counts a document shorter than its container as read", () => {
    // Nothing to scroll, so waiting for a scroll event would leave Accept
    // disabled with no way for anyone to enable it.
    expect(
      hasReachedEnd({ scrollTop: 0, clientHeight: 600, scrollHeight: 400 }),
    ).toBe(true);
    expect(
      hasReachedEnd({ scrollTop: 0, clientHeight: 600, scrollHeight: 600 }),
    ).toBe(true);
  });

  it("is false at the top of a long document", () => {
    expect(
      hasReachedEnd({ scrollTop: 0, clientHeight: 600, scrollHeight: 4000 }),
    ).toBe(false);
  });

  it("is false part way down", () => {
    expect(
      hasReachedEnd({ scrollTop: 1500, clientHeight: 600, scrollHeight: 4000 }),
    ).toBe(false);
  });

  it("is true at the bottom", () => {
    expect(
      hasReachedEnd({ scrollTop: 3400, clientHeight: 600, scrollHeight: 4000 }),
    ).toBe(true);
  });

  it("tolerates stopping a hair short of the bottom", () => {
    // Subpixel layout and browser zoom leave scrollTop fractionally short for
    // good, which without a tolerance never counts as read.
    expect(
      hasReachedEnd({
        scrollTop: 3400 - (SCROLL_END_TOLERANCE - 1),
        clientHeight: 600,
        scrollHeight: 4000,
      }),
    ).toBe(true);
  });

  it("does not treat just outside the tolerance as read", () => {
    expect(
      hasReachedEnd({
        scrollTop: 3400 - (SCROLL_END_TOLERANCE + 1),
        clientHeight: 600,
        scrollHeight: 4000,
      }),
    ).toBe(false);
  });
});
