import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

export const MAX_MESSAGE_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_FILENAME_CHARS = 255;

const BLOCKED_EXTENSIONS = new Set([
  "html",
  "htm",
  "xhtml",
  "svg",
  "svgz",
  "xml",
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "tsx",
  "php",
  "phtml",
  "jsp",
  "asp",
  "aspx",
  "exe",
  "dll",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "msi",
  "scr",
]);

const BLOCKED_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "text/xml",
  "application/xml",
  "application/x-msdownload",
  "application/x-sh",
]);

function normalizeMime(mimeType: string | null | undefined): string {
  if (!mimeType) return "";
  return mimeType.split(";")[0].trim().toLowerCase();
}

function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return "";
  return base.slice(idx + 1).trim().toLowerCase();
}

export function sanitizeUploadFilename(filename: string | null | undefined): string {
  const raw = (filename ?? "file")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split(/[\\/]/)
    .pop()
    ?.trim();
  const safe = raw && raw.length > 0 ? raw : "file";
  return safe.slice(0, MAX_ATTACHMENT_FILENAME_CHARS);
}

export function isBlockedFileType(
  filename: string,
  mimeType: string | null | undefined,
): boolean {
  const ext = fileExtension(filename);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) return true;
  const mime = normalizeMime(mimeType);
  if (mime && BLOCKED_MIME_TYPES.has(mime)) return true;
  return false;
}

export function validateUploadFile(input: {
  filename: string;
  mimeType: string | null | undefined;
  fileSize: number;
  maxBytes: number;
}): { ok: true; filename: string } | { ok: false; error: string } {
  const filename = sanitizeUploadFilename(input.filename);
  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    return { ok: false, error: "No file provided" };
  }
  if (input.fileSize > input.maxBytes) {
    return { ok: false, error: "File too large" };
  }
  if (isBlockedFileType(filename, input.mimeType)) {
    return { ok: false, error: "Unsupported file type" };
  }
  return { ok: true, filename };
}

export type AttachmentCandidate = {
  filename: string;
  url: string;
  fileSize?: number | null;
  mimeType?: string | null;
  durationMs?: number | null;
  waveform?: number[] | null;
};

export function validateMessageAttachments<T extends AttachmentCandidate>(
  attachments: T[],
  options: {
    r2PublicUrl?: string | null;
    maxCount?: number;
  } = {},
): { ok: true; attachments: T[] } | { ok: false; error: string } {
  const maxCount = options.maxCount ?? MAX_MESSAGE_ATTACHMENTS;
  if (attachments.length > maxCount) {
    return { ok: false, error: `Too many attachments (max ${maxCount})` };
  }

  const normalizedOrigin = options.r2PublicUrl
    ? options.r2PublicUrl.replace(/\/+$/, "")
    : null;

  const cleaned: T[] = [];
  for (const item of attachments) {
    if (!item || typeof item.url !== "string" || typeof item.filename !== "string") {
      return { ok: false, error: "Invalid attachment" };
    }
    const filename = sanitizeUploadFilename(item.filename);
    if (isBlockedFileType(filename, item.mimeType)) {
      return { ok: false, error: "Unsupported attachment file type" };
    }

    let parsed: URL;
    try {
      parsed = new URL(item.url);
    } catch {
      return { ok: false, error: "Invalid attachment URL" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Invalid attachment URL" };
    }
    if (item.url.includes("..") || parsed.pathname.includes("..")) {
      return { ok: false, error: "Invalid attachment URL" };
    }
    if (normalizedOrigin) {
      const target = parsed.toString();
      if (!target.startsWith(`${normalizedOrigin}/`)) {
        return { ok: false, error: "Attachment URL must be hosted on Nizek storage" };
      }
    }

    if (
      item.fileSize != null &&
      (!Number.isFinite(item.fileSize) ||
        item.fileSize < 0 ||
        item.fileSize > MAX_UPLOAD_BYTES)
    ) {
      return { ok: false, error: "Invalid attachment size" };
    }

    cleaned.push({
      ...item,
      filename,
    });
  }

  return { ok: true, attachments: cleaned };
}

export function resolveSafeMessageKind(
  requestedKind: string | undefined,
  internalToken: string | undefined,
  expectedToken: string,
): string {
  if (!requestedKind || requestedKind === "message") return "message";
  if (internalToken && internalToken === expectedToken) return requestedKind;
  return "message";
}
