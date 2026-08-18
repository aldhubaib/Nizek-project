import { describe, expect, it } from "vitest";
import {
  applyPoll,
  computeReleasedAt,
  decideMountAction,
  isCaughtUp,
  isNewerRelease,
  parseRelease,
  parseStoredUpdate,
  pickLatest,
  shouldSkipUpdateCheck,
  stripCacheBust,
  withCacheBust,
  type AppRelease,
} from "@/lib/app-release";

const v1: AppRelease = { version: "sha1.b100", releasedAt: 1_000 };
const v2: AppRelease = { version: "sha2.b100", releasedAt: 2_000 };
const v4: AppRelease = { version: "sha4.b100", releasedAt: 4_000 };

describe("computeReleasedAt", () => {
  it("uses the later of build time and branding token", () => {
    expect(computeReleasedAt(1_000, 100)).toBe(1_000);
    expect(computeReleasedAt(1_000, 2_000)).toBe(2_000);
  });

  it("treats a branding-only change (same build time, newer token) as newer", () => {
    const pageAt = computeReleasedAt(1_000, 100);
    const liveAt = computeReleasedAt(1_000, 2_000);
    const page = { version: "sha.b100", releasedAt: pageAt };
    const live = { version: "sha.b2000", releasedAt: liveAt };
    expect(isNewerRelease(live, page)).toBe(true);
  });

  it("ignores non-positive / non-finite values", () => {
    expect(computeReleasedAt(0, 50)).toBe(50);
    expect(computeReleasedAt(NaN, 50)).toBe(50);
    expect(computeReleasedAt(-1, 0)).toBe(0);
  });
});

describe("pickLatest", () => {
  it("takes incoming when there is no current target", () => {
    expect(pickLatest(null, v2)).toEqual(v2);
  });

  it("lets a newer deploy win over an older replica poll", () => {
    expect(pickLatest(v2, v4)).toEqual(v4);
    expect(pickLatest(v4, v2)).toEqual(v4);
  });
});

describe("applyPoll", () => {
  it("shows a newer live release", () => {
    expect(applyPoll(v1, null, v4)).toEqual(v4);
  });

  it("never lets an older replica overwrite a pending newer target", () => {
    expect(applyPoll(v1, v4, v2)).toEqual(v4);
  });

  it("moves the pending target forward when live is even newer", () => {
    expect(applyPoll(v1, v2, v4)).toEqual(v4);
  });

  it("hides the prompt when the page already matches live", () => {
    expect(applyPoll(v4, v4, v4)).toBeNull();
    expect(applyPoll(v4, null, v4)).toBeNull();
    expect(isCaughtUp(v4, v4)).toBe(true);
  });

  it("hides the prompt when live is not newer than the page", () => {
    expect(applyPoll(v4, null, v2)).toBeNull();
  });
});

describe("decideMountAction", () => {
  it("is idle when nothing is stored", () => {
    expect(decideMountAction(v1, null)).toEqual({ type: "idle" });
  });

  it("clears state when the page has caught up to the target", () => {
    expect(
      decideMountAction(v4, { ...v4, attempts: 1 }),
    ).toEqual({ type: "caught_up" });
  });

  it("silently retries while under the attempt cap", () => {
    expect(
      decideMountAction(v1, { ...v4, attempts: 1 }, 3),
    ).toEqual({
      type: "silent_retry",
      target: { ...v4, attempts: 2 },
    });
  });

  it("shows the banner again after the attempt cap so we cannot loop", () => {
    expect(
      decideMountAction(v1, { ...v4, attempts: 3 }, 3),
    ).toEqual({
      type: "show_banner",
      target: { ...v4, attempts: 3 },
    });
  });
});

describe("parseRelease", () => {
  it("reads version + releasedAt from the API payload", () => {
    expect(
      parseRelease({ version: "sha.b1", releasedAt: 99, logo: "/x" }),
    ).toEqual({ version: "sha.b1", releasedAt: 99 });
  });

  it("treats a missing releasedAt as 0 so an old replica cannot look newer", () => {
    expect(parseRelease({ version: "sha-old" })).toEqual({
      version: "sha-old",
      releasedAt: 0,
    });
  });

  it("rejects payloads without a version", () => {
    expect(parseRelease({})).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe("parseStoredUpdate", () => {
  it("reads a stored target", () => {
    expect(
      parseStoredUpdate(
        JSON.stringify({ version: "sha", releasedAt: 5, attempts: 2 }),
      ),
    ).toEqual({ version: "sha", releasedAt: 5, attempts: 2 });
  });

  it("returns null for junk", () => {
    expect(parseStoredUpdate("nope")).toBeNull();
    expect(parseStoredUpdate(null)).toBeNull();
  });
});

describe("cache-bust URL", () => {
  it("sets and replaces the _v query param", () => {
    const href = withCacheBust("https://app.example/inbox", "sha4.b100");
    expect(href).toBe("https://app.example/inbox?_v=sha4.b100");
    expect(withCacheBust(href, "sha5.b100")).toBe(
      "https://app.example/inbox?_v=sha5.b100",
    );
  });

  it("strips _v without dropping other params or the hash", () => {
    expect(
      stripCacheBust("https://app.example/inbox?foo=1&_v=sha4.b100#x"),
    ).toBe("https://app.example/inbox?foo=1#x");
  });
});

describe("shouldSkipUpdateCheck", () => {
  it("skips local/dev versions", () => {
    expect(shouldSkipUpdateCheck("dev")).toBe(true);
    expect(shouldSkipUpdateCheck("dev.b0")).toBe(true);
    expect(shouldSkipUpdateCheck("abc123.b1")).toBe(false);
  });
});
