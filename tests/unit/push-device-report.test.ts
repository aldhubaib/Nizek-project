// Validation of the telemetry body POST /api/push/device accepts.

import { describe, expect, it } from "vitest";
import { parseDeviceReport, platformFromUserAgent } from "@/lib/push/device-report";

describe("parseDeviceReport", () => {
  it("accepts a full report and normalises booleans", () => {
    const r = parseDeviceReport({
      deviceId: "d1",
      platform: "ios",
      standalone: true,
      permission: "denied",
      supportReason: null,
      hasSubscription: "yes",
      registered: true,
      enabled: false,
      lastReason: "permission-denied",
      lastDetail: null,
      userAgent: "UA",
      appBuild: "1758000000000",
    });
    expect(r).toEqual({
      deviceId: "d1",
      platform: "ios",
      standalone: true,
      permission: "denied",
      supportReason: null,
      hasSubscription: false,
      registered: true,
      enabled: false,
      lastReason: "permission-denied",
      lastDetail: null,
      userAgent: "UA",
      appBuild: "1758000000000",
    });
  });

  it("rejects reports without a device id and unknown enums fall back safely", () => {
    expect(parseDeviceReport({})).toBeNull();
    expect(parseDeviceReport(null)).toBeNull();
    const r = parseDeviceReport({ deviceId: "d", platform: "windows-phone", permission: "maybe" });
    expect(r?.platform).toBeNull();
    expect(r?.permission).toBe("unsupported");
  });

  it("caps oversized strings", () => {
    const r = parseDeviceReport({ deviceId: "x".repeat(500), lastDetail: "y".repeat(5000), userAgent: "z".repeat(5000) });
    expect(r?.deviceId).toHaveLength(128);
    expect(r?.lastDetail).toHaveLength(500);
    expect(r?.userAgent).toHaveLength(512);
  });
});

describe("platformFromUserAgent", () => {
  it("classifies iOS, Android, desktop and unknown", () => {
    expect(platformFromUserAgent("Mozilla/5.0 (iPhone; ...)")).toBe("ios");
    expect(platformFromUserAgent("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(platformFromUserAgent("Mozilla/5.0 (Macintosh)")).toBe("desktop");
    expect(platformFromUserAgent(null)).toBeNull();
  });
});
