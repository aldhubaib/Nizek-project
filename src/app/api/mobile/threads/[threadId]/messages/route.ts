import type { NextRequest } from "next/server";
import { getThreadMessages, sendMessage } from "@/actions/messages";
import { mobileRoute, parseThreadId, readJson, unwrap } from "@/lib/mobile/route";

export const runtime = "nodejs";

type Params = { threadId: string };

/** GET ?cursor=<messageId> → the page of older messages before that id. */
export const GET = mobileRoute<Params>(async (req: NextRequest, { threadId }) => {
  const cursorId = req.nextUrl.searchParams.get("cursor") ?? undefined;
  return getThreadMessages({ ...parseThreadId(threadId), cursorId });
});

type SendBody = {
  body: string;
  replyToId?: string | null;
  attachments?: {
    filename: string;
    url: string;
    fileSize?: number | null;
    mimeType?: string | null;
  }[];
};

/** POST { body, replyToId?, attachments? } → the created message. */
export const POST = mobileRoute<Params>(async (req: NextRequest, { threadId }) => {
  const input = await readJson<SendBody>(req);
  const target = parseThreadId(threadId);
  const attachments = Array.isArray(input.attachments)
    ? input.attachments
        .filter((a) => a && typeof a.url === "string" && typeof a.filename === "string")
        .map((a) => ({
          filename: a.filename,
          url: a.url,
          fileSize: typeof a.fileSize === "number" ? a.fileSize : null,
          mimeType: typeof a.mimeType === "string" ? a.mimeType : null,
        }))
    : [];
  const message = unwrap(
    await sendMessage({
      ...target,
      body: typeof input.body === "string" ? input.body : "",
      replyToId: input.replyToId ?? undefined,
      attachments,
    }),
  );
  return { message };
});
