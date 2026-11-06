import { NextResponse, type NextRequest } from "next/server";
import type { ActionResult } from "@/actions/messages";

/**
 * Small conventions shared by every `/api/mobile/*` route.
 *
 * The React Native app cannot call Server Actions, so these routes expose the
 * SAME action functions over plain JSON. They never re-implement permissions:
 * each handler calls into `src/actions` / `src/lib`, which run `requireUser()`
 * against the Better Auth session cookie the app sends in the `Cookie` header.
 *
 * Errors thrown by the actions are plain `Error`s with human messages, so this
 * maps the well-known ones to HTTP statuses and passes the text through to the
 * app, which shows it as-is.
 */

type Params = Record<string, string>;

type Handler<P extends Params> = (
  req: NextRequest,
  params: P,
) => Promise<unknown>;

export function mobileRoute<P extends Params = Record<string, never>>(
  handler: Handler<P>,
) {
  return async (
    req: NextRequest,
    ctx?: { params?: Promise<P> },
  ): Promise<NextResponse> => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      const data = await handler(req, params);
      return NextResponse.json(data ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Something went wrong";
  const status = statusFor(message);
  if (status >= 500) console.error("[api/mobile]", err);
  return NextResponse.json({ error: message }, { status });
}

function statusFor(message: string): number {
  const m = message.toLowerCase();
  if (m === "unauthorized") return 401;
  if (m === "account_blocked") return 403;
  if (m.includes("permission denied") || m.includes("not authorized")) return 403;
  if (m.includes("not a member")) return 403;
  if (m === "not found" || m.endsWith(" not found")) return 404;
  if (m.includes("invalid cursor") || m.includes("invalid")) return 400;
  if (m.includes("something went wrong")) return 500;
  return 400;
}

/** Unwrap an `ActionResult`; the app only ever sees `data` or an `{ error }`. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(result.error);
}

export async function readJson<T>(req: NextRequest): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** `project-<id>` | `conv-<id>` | `task-<id>` → the action target. */
export function parseThreadId(threadId: string): {
  taskId?: string;
  projectId?: string;
  conversationId?: string;
} {
  if (threadId.startsWith("task-")) return { taskId: threadId.slice(5) };
  if (threadId.startsWith("project-")) return { projectId: threadId.slice(8) };
  if (threadId.startsWith("conv-")) return { conversationId: threadId.slice(5) };
  throw new Error("Not found");
}
