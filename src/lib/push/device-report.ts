// The client-reported push state of one install, as stored in PushDevice.
// Pure (no browser or Prisma imports) so the API route, the client runtime
// and the tests share one definition.

export type PushPlatform = "ios" | "android" | "desktop";

export type PushPermissionState = NotificationPermission | "unsupported";

export interface PushDeviceReport {
  deviceId: string;
  platform: PushPlatform | null;
  standalone: boolean | null;
  permission: PushPermissionState;
  /** Why this device cannot subscribe at all (needs-install, unsupported…). */
  supportReason: string | null;
  hasSubscription: boolean;
  registered: boolean;
  enabled: boolean;
  /** Last failure reason from an enable attempt or automatic repair. */
  lastReason: string | null;
  lastDetail: string | null;
  userAgent: string | null;
  appBuild: string | null;
}

export const DEVICE_REPORT_MAX_BYTES = 8 * 1024;
/** Minimum gap between accepted reports from one device. */
export const DEVICE_REPORT_MIN_INTERVAL_S = 10;

const PLATFORMS: readonly PushPlatform[] = ["ios", "android", "desktop"];
const PERMISSIONS: readonly PushPermissionState[] = [
  "default",
  "granted",
  "denied",
  "unsupported",
];

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

function bool(v: unknown): boolean {
  return v === true;
}

/** Validates and caps an incoming report. Returns null when unusable. */
export function parseDeviceReport(body: unknown): PushDeviceReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const deviceId = str(b.deviceId, 128);
  if (!deviceId) return null;

  const platform = PLATFORMS.includes(b.platform as PushPlatform)
    ? (b.platform as PushPlatform)
    : null;
  const permission = PERMISSIONS.includes(b.permission as PushPermissionState)
    ? (b.permission as PushPermissionState)
    : "unsupported";

  return {
    deviceId,
    platform,
    standalone: typeof b.standalone === "boolean" ? b.standalone : null,
    permission,
    supportReason: str(b.supportReason, 64),
    hasSubscription: bool(b.hasSubscription),
    registered: bool(b.registered),
    enabled: bool(b.enabled),
    lastReason: str(b.lastReason, 64),
    lastDetail: str(b.lastDetail, 500),
    userAgent: str(b.userAgent, 512),
    appBuild: str(b.appBuild, 64),
  };
}

/** Platform from a user agent, for rows created by the SW (no window access). */
export function platformFromUserAgent(ua: string | null | undefined): PushPlatform | null {
  if (!ua) return null;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}
