import { NextRequest, NextResponse } from "next/server";
import { requireUser, getImpersonation } from "@/lib/auth";
import {
  DEVICE_REPORT_MAX_BYTES,
  parseDeviceReport,
} from "@/lib/push/device-report";
import {
  allowDeviceReport,
  readJsonCapped,
  upsertPushDevice,
} from "@/lib/push/device-state";

export const runtime = "nodejs";

/**
 * POST /api/push/device — telemetry upsert of this install's push state.
 * This is what lets an admin see "iPhone, standalone, permission denied,
 * last seen 2 min ago" instead of asking for a screenshot.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (await getImpersonation()) {
      return NextResponse.json({ ok: true, skipped: "impersonating" });
    }

    const parsed = await readJsonCapped(req, DEVICE_REPORT_MAX_BYTES);
    if (!parsed.ok) {
      return NextResponse.json({ error: "Invalid body" }, { status: parsed.status });
    }
    const report = parseDeviceReport(parsed.body);
    if (!report) {
      return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }

    if (!(await allowDeviceReport(user.id, report.deviceId))) {
      return NextResponse.json({ ok: true, throttled: true }, { status: 202 });
    }

    const { deviceId, ...patch } = report;
    await upsertPushDevice(user.id, deviceId, patch);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to record device" }, { status: 500 });
  }
}
