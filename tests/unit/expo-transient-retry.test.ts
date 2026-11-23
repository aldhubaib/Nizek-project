import { describe, expect, it } from "vitest";
import { classifyExpoResult } from "@/lib/mobile-push-core";

/** Mirrors worker deliverToMobile: transient Expo outcomes must fail the job. */
function shouldRetryExpoJob(counts: { transient: number; gone: number; permanent: number; ok: number }) {
  return counts.transient > 0;
}

describe("Expo transient → BullMQ retry", () => {
  it("classifies rate limits and provider errors as transient", () => {
    expect(
      classifyExpoResult({
        status: "error",
        details: { error: "MessageRateExceeded" },
      }),
    ).toBe("transient");
    expect(
      classifyExpoResult({
        status: "error",
        details: { error: "ProviderError" },
      }),
    ).toBe("transient");
    expect(classifyExpoResult(undefined)).toBe("transient");
  });

  it("retries the job when any send was transient", () => {
    expect(shouldRetryExpoJob({ ok: 2, transient: 1, gone: 0, permanent: 0 })).toBe(true);
  });

  it("does not retry when failures are only gone or permanent", () => {
    expect(shouldRetryExpoJob({ ok: 1, transient: 0, gone: 1, permanent: 1 })).toBe(false);
  });
});
