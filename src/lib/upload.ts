// Browser -> R2 upload.
//
// Small files (under MULTIPART_THRESHOLD_BYTES): one presigned direct-to-R2
// PUT. Cross-origin PUTs can fail on some mobile browsers and PWAs (CORS
// preflight quirks), so small files transparently fall back to a same-origin
// proxy upload (/api/upload) which has no CORS to trip over.
//
// Big files: multipart. The file is cut into 16 MB parts, each PUT straight to
// R2 with its own signed link, stall timer and retries; three parts travel at
// once. Finished parts are remembered in IndexedDB so the same file picked
// again after a reload or an iOS tab kill continues where it stopped. The
// proxy is not used for big files (it buffers them in server memory) — with
// one exception: when the bucket refuses browser uploads outright (CORS policy
// missing, or ETag not exposed — see docs/uploads.md), files up to
// MAX_PROXY_UPLOAD_BYTES take the proxy as before, and bigger ones fail fast
// with a message that names the fix instead of retrying for a minute.
//
// Every transfer watches for stalls (no progress for a while aborts the XHR
// instead of spinning forever).

import {
  MAX_PROXY_UPLOAD_BYTES,
  MAX_PROXY_UPLOAD_LABEL,
  MULTIPART_PART_BYTES,
  MULTIPART_SIGN_BATCH_MAX,
  MULTIPART_THRESHOLD_BYTES,
} from "@/lib/upload-limits";
import {
  PART_PARALLELISM,
  PART_RETRY_DELAYS_MS,
  fileFingerprint,
  isDirectUploadBlocked,
  isResumable,
  normalizeEtag,
  partCountFor,
  partRange,
  partStatusLabel,
  remainingParts,
  uploadedBytes,
  type MultipartResumeRecord,
} from "@/lib/upload-multipart-core";
import {
  clearResumeRecord,
  loadResumeRecord,
  saveResumeRecord,
} from "@/lib/upload-resume-store";

export type UploadedFile = {
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string | null;
};

/** An upload failure whose message is safe to show the user as-is. */
export class UploadError extends Error {
  /** HTTP status of the failing request, when there was one. */
  status?: number;
  /**
   * The bucket refuses browser uploads from this site (CORS policy missing or
   * ETag not exposed). A configuration problem: retrying cannot fix it, the
   * same-origin proxy can (for files it is allowed to carry).
   */
  blocked?: boolean;
  constructor(message: string, status?: number, blocked = false) {
    super(message);
    this.status = status;
    this.blocked = blocked;
  }
}

/** Short, human text about what the upload is doing ("Resuming part 7 of 19"). */
export type UploadStatusListener = (text: string | null) => void;

/**
 * No bytes moving for this long counts as a dead connection. Two minutes, not
 * one: a phone switching from Wi-Fi to 4G (or waking from a short lock) can
 * legitimately pause a transfer for over a minute and then continue.
 */
const STALL_TIMEOUT_MS = 120_000;

/** Waits between direct-PUT attempts for small files (attempt count = length + 1). */
const RETRY_DELAYS_MS = [1_000, 3_000];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Upload failed";
}

export async function uploadFileToR2(
  file: File,
  onProgress?: (pct: number) => void,
  onStatus?: UploadStatusListener,
): Promise<UploadedFile> {
  if (file.size >= MULTIPART_THRESHOLD_BYTES) {
    try {
      return await uploadMultipart(file, onProgress, onStatus);
    } catch (err) {
      if (!(err instanceof UploadError) || !err.blocked) throw err;
      // Storage will not take browser uploads from this site. Files the proxy
      // route is allowed to carry go that way (the pre-multipart behaviour);
      // bigger ones need the bucket CORS fix and say so.
      if (file.size > MAX_PROXY_UPLOAD_BYTES) {
        throw new UploadError(
          `${err.message}. Until that is fixed, files over ${MAX_PROXY_UPLOAD_LABEL} cannot be uploaded — "${file.name}" is too large for the fallback route`,
        );
      }
      onStatus?.("Direct upload blocked — using fallback route");
      try {
        return await uploadViaServer(file, onProgress);
      } finally {
        onStatus?.(null);
      }
    }
  }

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
  // Retry through our own origin, which always works cross-device. Only small
  // files get here, so the in-memory proxy is safe.
  try {
    return await uploadViaServer(file, onProgress);
  } catch (err) {
    throw new UploadError(`${messageOf(lastErr)}; fallback: ${messageOf(err)}`);
  }
}

/**
 * Runs one XHR transfer with progress reporting and stall detection: if no
 * progress event arrives for STALL_TIMEOUT_MS the request is aborted and the
 * promise rejects, instead of hanging on a dead connection forever.
 */
function transfer(
  xhr: XMLHttpRequest,
  body: Blob | FormData,
  what: string,
  onProgress?: (loaded: number, total: number) => void,
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
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
    };
    xhr.onload = () =>
      done(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new UploadError(`${what} failed (HTTP ${xhr.status})`, xhr.status));
      });
    xhr.onerror = () =>
      done(() => reject(new UploadError(`${what} failed — network error`)));
    xhr.onabort = () =>
      done(() => reject(new UploadError(`${what} was interrupted`)));

    armStallTimer();
    xhr.send(body);
  });
}

const pctOf = (loaded: number, total: number) =>
  total > 0 ? Math.round((loaded / total) * 100) : 0;

async function postJson<T>(path: string, body: unknown, what: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new UploadError(`${what} failed — network error`);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {}
    throw new UploadError(detail || `${what} failed (HTTP ${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

// ─── Small files: single PUT ─────────────────────────────────────────────────

async function uploadViaPresign(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedFile> {
  const contentType = file.type || "application/octet-stream";

  const { uploadUrl, url } = await postJson<{ uploadUrl: string; url: string }>(
    "/api/upload/presign",
    { filename: file.name, contentType, size: file.size },
    "Upload prep",
  );

  const xhr = new XMLHttpRequest();
  xhr.open("PUT", uploadUrl);
  xhr.setRequestHeader("Content-Type", contentType);
  await transfer(xhr, file, "Upload", (loaded, total) =>
    onProgress?.(pctOf(loaded, total)),
  );

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
  await transfer(xhr, form, "Upload", (loaded, total) =>
    onProgress?.(Math.min(99, pctOf(loaded, total))),
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

// ─── Big files: multipart, resumable ─────────────────────────────────────────

type CreateResponse = {
  key: string;
  uploadId: string;
  url: string;
  partSize: number;
  partCount: number;
};

const ETAG_MISSING_HINT =
  "upload part finished but R2 did not expose its ETag — the bucket CORS policy must list ETag under ExposeHeaders (see docs/uploads.md)";
const DIRECT_BLOCKED_HINT =
  "storage refused the browser upload — the bucket CORS policy does not allow this site (see docs/uploads.md)";

export async function uploadMultipart(
  file: File,
  onProgress?: (pct: number) => void,
  onStatus?: UploadStatusListener,
  allowRestart = true,
): Promise<UploadedFile> {
  const contentType = file.type || "application/octet-stream";
  const fingerprint = fileFingerprint(file);
  const partSize = MULTIPART_PART_BYTES;
  const partCount = partCountFor(file.size, partSize);

  // 1. Resume if we remember this exact file, else start a new upload.
  let record: MultipartResumeRecord;
  const saved = await loadResumeRecord(fingerprint);
  const resumed = isResumable(saved, file, partSize);
  if (resumed) {
    record = saved;
  } else {
    if (saved) void clearResumeRecord(fingerprint);
    const created = await postJson<CreateResponse>(
      "/api/upload/multipart/create",
      { filename: file.name, contentType, size: file.size },
      "Upload prep",
    );
    record = {
      fingerprint,
      key: created.key,
      uploadId: created.uploadId,
      url: created.url,
      partSize: created.partSize || partSize,
      partCount: created.partCount || partCount,
      etags: {},
      updatedAt: Date.now(),
    };
    await saveResumeRecord(record);
  }

  // 2. Progress = bytes safely in R2 + bytes in flight, over the file size.
  let doneBytes = uploadedBytes(record, file.size);
  const inflight = new Map<number, number>();
  const report = () => {
    if (!onProgress) return;
    let loaded = doneBytes;
    for (const v of inflight.values()) loaded += v;
    // Hold at 99% until complete() confirms the object exists.
    onProgress(Math.min(99, pctOf(loaded, file.size)));
  };
  report();

  // 3. Signed links are fetched in batches as parts are consumed, and
  //    refreshed on 403 (a 2 GB file on slow 4G can outlive a 1-hour link).
  const urls = new Map<number, string>();
  const signBatch = async (parts: number[]) => {
    if (parts.length === 0) return;
    const { urls: fresh } = await postJson<{ urls: Record<string, string> }>(
      "/api/upload/multipart/sign",
      { key: record.key, uploadId: record.uploadId, partNumbers: parts },
      "Upload prep",
    );
    for (const [n, u] of Object.entries(fresh)) urls.set(Number(n), u);
  };
  const queue = remainingParts(record.partCount, record.etags);
  const urlFor = async (partNumber: number): Promise<string> => {
    const cached = urls.get(partNumber);
    if (cached) return cached;
    // Sign this part plus the next few still queued, so one round trip
    // covers the parts the three workers will pick up next.
    const idx = queue.indexOf(partNumber);
    const upcoming = idx === -1 ? [partNumber] : queue.slice(idx, idx + 16);
    await signBatch(
      [...new Set([partNumber, ...upcoming])]
        .filter((n) => !urls.has(n))
        .slice(0, MULTIPART_SIGN_BATCH_MAX),
    );
    const url = urls.get(partNumber);
    if (!url) throw new UploadError(`Could not prepare part ${partNumber}`);
    return url;
  };

  let restartNeeded = false;
  const retryingParts = new Set<number>();
  // One status line per file, driven by how many parts landed — not by
  // whichever of the three workers spoke last, which would flicker.
  const announce = () => {
    if (!onStatus) return;
    const done = Object.keys(record.etags).length;
    const current = Math.min(record.partCount, done + 1);
    const label = partStatusLabel(current, record.partCount, resumed);
    onStatus(retryingParts.size > 0 ? `${label} (retrying)` : label);
  };
  announce();

  const sendPart = async (partNumber: number): Promise<void> => {
    const { start, end } = partRange(partNumber, file.size, record.partSize);
    const blob = file.slice(start, end);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= PART_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        retryingParts.add(partNumber);
        announce();
        await delay(PART_RETRY_DELAYS_MS[attempt - 1]);
        if (!navigator.onLine) {
          // Wait for the network to come back before burning a retry.
          await new Promise<void>((resolve) => {
            const onUp = () => {
              window.removeEventListener("online", onUp);
              resolve();
            };
            window.addEventListener("online", onUp);
            setTimeout(() => {
              window.removeEventListener("online", onUp);
              resolve();
            }, STALL_TIMEOUT_MS);
          });
        }
      }
      try {
        const url = await urlFor(partNumber);
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        inflight.set(partNumber, 0);
        await transfer(xhr, blob, `Part ${partNumber}`, (loaded) => {
          inflight.set(partNumber, loaded);
          report();
        });
        const etag = normalizeEtag(xhr.getResponseHeader("ETag"));
        if (!etag) throw new UploadError(ETAG_MISSING_HINT, undefined, true);
        inflight.delete(partNumber);
        doneBytes += end - start;
        record = { ...record, etags: { ...record.etags, [partNumber]: etag } };
        retryingParts.delete(partNumber);
        await saveResumeRecord(record);
        report();
        announce();
        return;
      } catch (err) {
        inflight.delete(partNumber);
        report();
        lastErr = err;
        const status = err instanceof UploadError ? err.status : undefined;
        if (status === 403) urls.delete(partNumber); // link expired → re-sign
        if (status === 404) {
          // NoSuchUpload: R2 no longer knows this uploadId (aborted by the
          // daily cron or by another device). Nothing to retry — restart.
          restartNeeded = true;
          throw err;
        }
        if (err instanceof UploadError && err.blocked) {
          throw err; // configuration problem; retrying cannot fix it
        }
        if (
          isDirectUploadBlocked({
            status,
            partsLanded: Object.keys(record.etags).length,
            online: navigator.onLine,
            attempt,
          })
        ) {
          throw new UploadError(DIRECT_BLOCKED_HINT, undefined, true);
        }
      }
    }
    retryingParts.delete(partNumber);
    throw lastErr instanceof Error
      ? lastErr
      : new UploadError(`Part ${partNumber} failed`);
  };

  // 4. Three workers pull from the queue until it is empty or one gives up.
  let cursor = 0;
  let failure: unknown = null;
  const worker = async () => {
    while (cursor < queue.length && failure === null) {
      const partNumber = queue[cursor++];
      try {
        await sendPart(partNumber);
      } catch (err) {
        failure = err;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PART_PARALLELISM, queue.length) }, worker),
  );

  if (failure !== null) {
    if (restartNeeded) {
      await clearResumeRecord(fingerprint);
      if (allowRestart) {
        onStatus?.("Starting over");
        return uploadMultipart(file, onProgress, onStatus, false);
      }
    }
    if (failure instanceof UploadError && failure.blocked) {
      // Nothing of this upload can ever land from the browser: drop the
      // server-side upload now rather than leaving it for the daily cron.
      await clearResumeRecord(fingerprint);
      void abortMultipart(record.key, record.uploadId);
    }
    // Otherwise keep the record: Retry resumes from the parts that did land.
    onStatus?.(null);
    throw failure instanceof Error ? failure : new UploadError("Upload failed");
  }

  // 5. Stitch the parts together. Retry a few times — losing this call to a
  //    network blip would otherwise throw away a finished 2 GB upload.
  onStatus?.("Finishing upload");
  const parts = Object.entries(record.etags).map(([n, etag]) => ({
    partNumber: Number(n),
    etag,
  }));
  let completeErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
    try {
      const { url } = await postJson<{ url: string }>(
        "/api/upload/multipart/complete",
        { key: record.key, uploadId: record.uploadId, parts },
        "Finishing upload",
      );
      await clearResumeRecord(fingerprint);
      onStatus?.(null);
      onProgress?.(100);
      return {
        filename: file.name,
        url,
        fileSize: file.size,
        mimeType: file.type || null,
      };
    } catch (err) {
      completeErr = err;
      const status = err instanceof UploadError ? err.status : undefined;
      // Our server rejected the part list (400) or R2 refused to assemble
      // (500: bad/expired parts). The saved parts are useless — drop them so
      // Retry starts clean rather than failing the same way forever.
      if (status === 400 || status === 500) {
        await clearResumeRecord(fingerprint);
        void abortMultipart(record.key, record.uploadId);
        break;
      }
    }
  }
  onStatus?.(null);
  throw completeErr instanceof Error ? completeErr : new UploadError("Finishing upload failed");
}

async function abortMultipart(key: string, uploadId: string): Promise<void> {
  try {
    await fetch("/api/upload/multipart/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, uploadId }),
      keepalive: true,
    });
  } catch {
    // Best-effort; the daily cron aborts anything we miss.
  }
}

/**
 * The user discarded a message whose big file never finished: tell R2 to drop
 * the parts and forget the resume record. Safe to call for any file.
 */
export async function abandonUpload(file: File): Promise<void> {
  if (file.size < MULTIPART_THRESHOLD_BYTES) return;
  const fingerprint = fileFingerprint(file);
  const saved = await loadResumeRecord(fingerprint);
  await clearResumeRecord(fingerprint);
  if (saved?.key && saved.uploadId) await abortMultipart(saved.key, saved.uploadId);
}
