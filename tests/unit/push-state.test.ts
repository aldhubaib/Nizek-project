// The push state machine (src/lib/push/state.ts), walked through the three
// real-world scenarios that produced every support ticket so far:
//   S1 — someone installed the PWA, removed it, reinstalled
//   S2 — fresh install
//   S3 — user has the old app and we shipped an update

import { describe, expect, it } from "vitest";
import {
  HEAL_COOLDOWN_MS,
  derivePushView,
  describePushFailure,
  describeView,
  shouldAttemptHeal,
  shouldGate,
  type PushViewInput,
} from "@/lib/push/state";
import { pushFailure } from "@/lib/push/support";

const PROD = { production: true };

function input(over: Partial<PushViewInput>): PushViewInput {
  return {
    support: { ok: true },
    platform: "ios",
    standalone: true,
    permission: "granted",
    enabled: null,
    repairing: false,
    lastFailure: null,
    ...over,
  };
}

describe("S2 — fresh install", () => {
  it("iOS Safari tab: install steps, gated, no dead button", () => {
    const view = derivePushView(input({ support: pushFailure("needs-install"), standalone: false }));
    expect(view).toBe("install");
    expect(shouldGate(view, PROD)).toBe(true);
    expect(describeView(view, "ios", null)?.actionLabel).toBeNull();
  });

  it("iOS Chrome tab: open-in-Safari steps, gated, no dead button", () => {
    const view = derivePushView(
      input({ support: pushFailure("needs-safari-install"), standalone: false }),
    );
    expect(view).toBe("safari-install");
    expect(shouldGate(view, PROD)).toBe(true);
    const g = describeView(view, "ios", null);
    expect(g?.actionLabel).toBeNull();
    expect(g?.steps.join(" ")).toMatch(/Safari/);
  });

  it("iOS standalone, permission default: pre-prompt explainer with Continue", () => {
    const view = derivePushView(input({ permission: "default" }));
    expect(view).toBe("pre-prompt");
    expect(shouldGate(view, PROD)).toBe(true);
    const g = describeView(view, "ios", null);
    expect(g?.actionLabel).toBe("Continue");
    expect(g?.steps.join(" ")).toMatch(/Don't Allow/);
  });

  it("desktop, permission default: plain Enable prompt", () => {
    const view = derivePushView(input({ platform: "desktop", standalone: false, permission: "default" }));
    expect(view).toBe("prompt");
    expect(shouldGate(view, PROD)).toBe(true);
    expect(describeView(view, "desktop", null)).toBeNull();
  });

  it("granted but no subscription yet: verifying → repairing → enabled, never gated meanwhile", () => {
    const verifying = derivePushView(input({ enabled: null }));
    expect(verifying).toBe("verifying");
    expect(shouldGate(verifying, PROD)).toBe(false);

    const repairing = derivePushView(input({ enabled: false, repairing: true }));
    expect(repairing).toBe("repairing");
    expect(shouldGate(repairing, PROD)).toBe(false);

    const enabled = derivePushView(input({ enabled: true }));
    expect(enabled).toBe("enabled");
    expect(shouldGate(enabled, PROD)).toBe(false);
  });

  it("granted, repair failed once: repair-failed with the concrete reason, gated, retry offered", () => {
    const view = derivePushView(
      input({ enabled: false, lastFailure: { reason: "no-service-worker" } }),
    );
    expect(view).toBe("repair-failed");
    expect(shouldGate(view, PROD)).toBe(true);
    const g = describeView(view, "ios", { reason: "no-service-worker" });
    expect(g?.title).toMatch(/isn't ready/);
    expect(g?.actionLabel).toBe("Try again");
  });
});

describe("S1 — installed, removed, reinstalled", () => {
  it("a reinstall starts from default → pre-prompt (iOS forgets the grant)", () => {
    expect(derivePushView(input({ permission: "default" }))).toBe("pre-prompt");
  });

  it("new install where the user tapped Don't Allow: denied with two recovery paths", () => {
    const view = derivePushView(input({ permission: "denied" }));
    expect(view).toBe("denied");
    expect(shouldGate(view, PROD)).toBe(true);
    const g = describeView(view, "ios", null);
    expect(g?.paths).toHaveLength(2);
    expect(g?.paths?.[0].steps.join(" ")).toMatch(/Settings/);
    expect(g?.paths?.[1].steps.join(" ")).toMatch(/Delete/);
    expect(g?.paths?.[1].steps.join(" ")).toMatch(/Safari/);
    expect(g?.actionLabel).toMatch(/check again/i);
  });

  it("denied on Android/desktop keeps a single settings path", () => {
    expect(describeView("denied", "android", null)?.paths).toBeUndefined();
    expect(describeView("denied", "desktop", null)?.steps.length).toBeGreaterThan(0);
  });

  it("the old install's row is the worker's problem, not the client's: enabled once the new sub registers", () => {
    expect(derivePushView(input({ enabled: true }))).toBe("enabled");
  });
});

describe("S3 — existing user, app updated", () => {
  it("granted + subscribed + registered stays enabled and is never gated during a check", () => {
    // enabled=true is retained while a background check runs (repairing=false).
    expect(shouldGate(derivePushView(input({ enabled: true })), PROD)).toBe(false);
  });

  it("subscription no longer registered (row pruned, endpoint rotated): heal is attempted once", () => {
    const now = 1_000_000;
    expect(
      shouldAttemptHeal({ permission: "granted", enabled: false, supported: true, lastHealAt: 0, now }),
    ).toBe(true);
    expect(
      shouldAttemptHeal({
        permission: "granted",
        enabled: false,
        supported: true,
        lastHealAt: now - 1_000,
        now,
      }),
    ).toBe(false);
    expect(
      shouldAttemptHeal({
        permission: "granted",
        enabled: false,
        supported: true,
        lastHealAt: now - HEAL_COOLDOWN_MS,
        now,
      }),
    ).toBe(true);
  });

  it("also heals when the status check timed out (enabled unknown)", () => {
    expect(
      shouldAttemptHeal({
        permission: "granted",
        enabled: null,
        supported: true,
        lastHealAt: 0,
        now: HEAL_COOLDOWN_MS,
      }),
    ).toBe(true);
  });

  it("never heals without granted permission or when already enabled", () => {
    expect(
      shouldAttemptHeal({
        permission: "default",
        enabled: false,
        supported: true,
        lastHealAt: 0,
        now: HEAL_COOLDOWN_MS,
      }),
    ).toBe(false);
    expect(
      shouldAttemptHeal({
        permission: "granted",
        enabled: true,
        supported: true,
        lastHealAt: 0,
        now: HEAL_COOLDOWN_MS,
      }),
    ).toBe(false);
  });
});

describe("gate policy", () => {
  it("never gates in development", () => {
    expect(shouldGate("prompt", { production: false })).toBe(false);
    expect(shouldGate("denied", { production: false })).toBe(false);
  });

  it("never gates unsupported browsers with no fix, or impersonating admins", () => {
    expect(derivePushView(input({ support: pushFailure("unsupported") }))).toBe("unsupported");
    expect(shouldGate("unsupported", PROD)).toBe(false);
    expect(
      derivePushView(input({ enabled: false, lastFailure: { reason: "impersonating" } })),
    ).toBe("impersonating");
    expect(shouldGate("impersonating", PROD)).toBe(false);
  });

  it("permission unsupported (no Notification API) is unsupported even with PushManager", () => {
    expect(derivePushView(input({ permission: "unsupported" }))).toBe("unsupported");
  });
});

describe("describePushFailure", () => {
  it("returns guidance for every reason with a retry only where it can help", () => {
    const retryable = ["permission-dismissed", "no-service-worker", "subscribe-failed", "server-rejected", "permission-denied"] as const;
    const dead = ["needs-install", "needs-safari-install", "impersonating", "unsupported"] as const;
    for (const r of retryable) expect(describePushFailure(r, "desktop").actionLabel).not.toBeNull();
    for (const r of dead) expect(describePushFailure(r, "desktop").actionLabel).toBeNull();
  });

  it("iOS-specific copy tells users to force-quit, Android to use App info", () => {
    expect(describePushFailure("no-service-worker", "ios").steps.join(" ")).toMatch(/Fully close/);
    expect(describePushFailure("permission-denied", "android").steps.join(" ")).toMatch(/App info/);
  });
});
