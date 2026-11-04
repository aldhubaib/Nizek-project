import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";

export const runtime = "nodejs";

/**
 * Client-side send failures. Server-side failures already log themselves in
 * sendMessage ("[send-failure]"); this catches what never reached the action:
 * uploads that died, network errors, the action call itself timing out. One
 * line per failure, with sizes, so "long message cannot be sent" has data.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new NextResponse(null, { status: 204 });
  const userId = session.user.id;

  let data: unknown = null;
  try {
    data = await req.json();
  } catch {}
  const d = (data ?? {}) as {
    threadKey?: string;
    stage?: string;
    bodyLength?: number;
    attachmentCount?: number;
    attachmentBytes?: number;
    reason?: string;
    userAgent?: string;
    online?: boolean;
  };
  console.error(
    "[send-failure:client]",
    JSON.stringify({
      userId,
      threadKey: typeof d.threadKey === "string" ? d.threadKey.slice(0, 80) : null,
      stage: typeof d.stage === "string" ? d.stage.slice(0, 40) : null,
      bodyLength: typeof d.bodyLength === "number" ? d.bodyLength : null,
      attachmentCount: typeof d.attachmentCount === "number" ? d.attachmentCount : null,
      attachmentBytes: typeof d.attachmentBytes === "number" ? d.attachmentBytes : null,
      reason: typeof d.reason === "string" ? d.reason.slice(0, 500) : null,
      online: typeof d.online === "boolean" ? d.online : null,
      userAgent: typeof d.userAgent === "string" ? d.userAgent.slice(0, 300) : null,
    }),
  );
  return new NextResponse(null, { status: 204 });
}
