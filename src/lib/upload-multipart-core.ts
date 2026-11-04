// Pure helpers for the multipart (resumable) upload path. No browser APIs, so
// they are unit tested directly; src/lib/upload.ts does the actual transfers.

import { MULTIPART_PART_BYTES } from "@/lib/upload-limits";

/** A multipart upload remembered in the browser so it can be resumed. */
export type MultipartResumeRecord = {
  /** name + size + lastModified of the picked file. */
  fingerprint: string;
  key: string;
  uploadId: string;
  /** Public URL the object will have once completed. */
  url: string;
  partSize: number;
  partCount: number;
  /** ETag R2 returned for each finished part, by part number (1-based). */
  etags: Record<number, string>;
  updatedAt: number;
};

/**
 * Identity of a picked file across reloads. Browsers give no stable file id,
 * but name + size + lastModified is as good as it gets and false matches
 * are harmless: R2 verifies every part's ETag on complete.
 */
export function fileFingerprint(
  file: { name: string; size: number; lastModified: number },
): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export function partCountFor(size: number, partSize = MULTIPART_PART_BYTES): number {
  return Math.max(1, Math.ceil(size / partSize));
}

/** Byte range [start, end) of a 1-based part number. */
export function partRange(
  partNumber: number,
  size: number,
  partSize = MULTIPART_PART_BYTES,
): { start: number; end: number } {
  const start = (partNumber - 1) * partSize;
  return { start, end: Math.min(size, start + partSize) };
}

/** Part numbers still to send, in order. */
export function remainingParts(
  partCount: number,
  etags: Record<number, string>,
): number[] {
  const out: number[] = [];
  for (let n = 1; n <= partCount; n++) if (!etags[n]) out.push(n);
  return out;
}

/** Bytes already safely in R2 for a record. */
export function uploadedBytes(record: {
  partCount: number;
  partSize: number;
  etags: Record<number, string>;
}, size: number): number {
  let total = 0;
  for (const key of Object.keys(record.etags)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || n > record.partCount) continue;
    const { start, end } = partRange(n, size, record.partSize);
    total += end - start;
  }
  return total;
}

/**
 * A saved record only helps if it describes the same cut of the same file.
 * Part size or count drifting (constant changed between deploys) means the
 * saved parts would not line up — start over instead.
 */
export function isResumable(
  record: MultipartResumeRecord | null | undefined,
  file: { size: number },
  partSize = MULTIPART_PART_BYTES,
): record is MultipartResumeRecord {
  if (!record) return false;
  if (record.partSize !== partSize) return false;
  if (record.partCount !== partCountFor(file.size, partSize)) return false;
  if (!record.key || !record.uploadId) return false;
  return Object.keys(record.etags).length > 0;
}

/** "Resuming part 7 of 19" / "Part 7 of 19" for the outbox bubble. */
export function partStatusLabel(
  partNumber: number,
  partCount: number,
  resumed: boolean,
): string {
  return `${resumed ? "Resuming part" : "Part"} ${partNumber} of ${partCount}`;
}

/** Waits between attempts of one part: 1s, 2s, 4s, 8s, 16s (5 retries). */
export const PART_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

/**
 * Whether a failing part means "the bucket refuses browser uploads from this
 * site" (CORS policy missing or not matching) rather than a flaky network.
 * A CORS block is deterministic and status-less (the browser never gets a
 * response), so: no HTTP status, the device is online, and no part of this
 * upload has ever landed. One retry is allowed first so a single dropped
 * connection on the very first part does not trip it.
 */
export function isDirectUploadBlocked(input: {
  /** HTTP status of the failure, undefined when there was no response. */
  status: number | undefined;
  /** Parts already stored in R2 for this upload. */
  partsLanded: number;
  online: boolean;
  /** 0 = first try. */
  attempt: number;
}): boolean {
  return (
    input.status === undefined &&
    input.partsLanded === 0 &&
    input.online &&
    input.attempt >= 1
  );
}

/** Parts sent at the same time. */
export const PART_PARALLELISM = 3;

/**
 * Strip the quotes S3-style ETags arrive with (`"abc"` → `abc`). R2 accepts
 * both forms on complete, but a normalized value keeps the saved record tidy.
 */
export function normalizeEtag(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  return trimmed.length > 0 ? trimmed : null;
}
