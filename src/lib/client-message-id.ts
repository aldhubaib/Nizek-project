export const MAX_CLIENT_MESSAGE_ID_CHARS = 128;

export function normalizeClientMessageId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CLIENT_MESSAGE_ID_CHARS) {
    return trimmed.slice(0, MAX_CLIENT_MESSAGE_ID_CHARS);
  }
  return trimmed;
}

export function isClientMessageIdUniqueError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code !== "P2002") return false;
  const meta = (err as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  if (Array.isArray(target)) {
    return target.includes("clientMessageId");
  }
  if (typeof target === "string") {
    return target.includes("clientMessageId");
  }
  return true;
}
