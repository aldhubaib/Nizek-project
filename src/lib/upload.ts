// Browser -> R2 upload. Primary path is a presigned direct-to-R2 PUT (no file
// bytes through our server). Cross-origin PUTs can fail on some mobile browsers
// and PWAs (CORS preflight quirks), so we transparently fall back to a
// same-origin proxy upload (/api/upload) which has no CORS to trip over.
//
// Every transfer watches for stalls (no progress for a while aborts the XHR
// instead of spinning forever) and the direct PUT retries transient failures
// before giving up, so a flaky mobile connection gets more than one chance.

import { MAX_PROXY_UPLOAD_BYTES } from "@/lib/upload-limits";

export type UploadedFile = {
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string | null;
};

/** An upload failure whose message is safe to show the user as-is. */
export class UploadError extends Error {}

/** No bytes moving for this long counts as a dead connection. */
const STALL_TIMEOUT_MS = 60_000;

/** Waits between direct-PUT attempts (attempt count = length + 1). */
const RETRY_DELAYS_MS = [1_000, 3_000];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Upload failed";
}

export async function uploadFileToR2(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedFile> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt - 1]);
    try {
      return await uploadViaPresign(file, onProgress);
    } catch (err) {
      lastErr = err;
    }
  }

  // Direct-to-R2 failed repeatedly (commonly CORS/network on mobile/PWA).
  // Retry through our own origin, which always works cross-device. The proxy
  // buffers the file in server memory though, so files over its limit must not
  // silently fall back to it and die there — surface the real error instead.
  if (file.size > MAX_PROXY_UPLOAD_BYTES) {
    throw new UploadError(
      `${messageOf(lastErr)} — "${file.name}" is too large for the fallback route, try a smaller file or a better connection`,
    );
  }
  try {
    return await uploadViaServer(file, onProgress);
  } catch (err) {
    throw new UploadError(messageOf(err));
  }
}

/**
 * Runs one XHR transfer with progress reporting and stall detection: if no
 * progress event arrives for STALL_TIMEOUT_MS the request is aborted and the
 * promise rejects, instead of hanging on a dead connection forever.
 */
function transfer(
  xhr: XMLHttpRequest,
  body: File | FormData,
  what: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let stallTimer: ReturnType<typeof setTimeout>;
    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        xhr.abort();
        reject(
          new UploadError(
            `${what} stalled — no progress for ${Math.round(STALL_TIMEOUT_MS / 1000)}s`,
          ),
        );
      }, STALL_TIMEOUT_MS);
    };
    const done = (fn: () => void) => {
      clearTimeout(stallTimer);
      fn();
    };

    xhr.upload.onprogress = (e) => {
      armStallTimer();
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      done(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new UploadError(`${what} failed (HTTP ${xhr.status})`));
      });
    xhr.onerror = () =>
      done(() => reject(new UploadError(`${what} failed — network error`)));
    xhr.onabort = () =>
      done(() => reject(new UploadError(`${what} was interrupted`)));

    armStallTimer();
    xhr.send(body);
  });
}

async function uploadViaPresign(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedFile> {
  const contentType = file.type || "application/octet-stream";

  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType,
      size: file.size,
    }),
  });
  if (!presignRes.ok) {
    let detail = "";
    try {
      detail = ((await presignRes.json()) as { error?: string }).error ?? "";
    } catch {}
    throw new UploadError(
      detail || `Upload prep failed (HTTP ${presignRes.status})`,
    );
  }
  const { uploadUrl, url } = (await presignRes.json()) as {
    uploadUrl: string;
    url: string;
  };

  const xhr = new XMLHttpRequest();
  xhr.open("PUT", uploadUrl);
  xhr.setRequestHeader("Content-Type", contentType);
  await transfer(xhr, file, "Upload", onProgress);

  return {
    filename: file.name,
    url,
    fileSize: file.size,
    mimeType: file.type || null,
  };
}

async function uploadViaServer(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedFile> {
  const form = new FormData();
  form.set("file", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload");
  // Cap at 99% until the server responds so it doesn't jump to done early.
  await transfer(xhr, form, "Upload", (pct) =>
    onProgress?.(Math.min(99, pct)),
  );

  try {
    const data = JSON.parse(xhr.responseText) as {
      url: string;
      filename?: string;
      fileSize?: number;
      mimeType?: string | null;
    };
    onProgress?.(100);
    return {
      filename: data.filename ?? file.name,
      url: data.url,
      fileSize: data.fileSize ?? file.size,
      mimeType: data.mimeType ?? (file.type || null),
    };
  } catch {
    throw new UploadError("Upload finished but the server response was invalid");
  }
}
