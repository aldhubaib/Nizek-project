import "server-only";
import crypto from "node:crypto";

/**
 * Per-process secret used by server-only modules when calling sendMessage with
 * a non-default system card kind. Browser callers cannot obtain this token.
 */
export const INTERNAL_MESSAGE_KIND_TOKEN = crypto.randomUUID();
