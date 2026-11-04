import { describe, expect, it } from "vitest";
import {
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
  MAX_UPLOAD_BYTES,
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_BYTES,
  MULTIPART_THRESHOLD_BYTES,
} from "@/lib/upload-limits";

const MB = 1024 * 1024;

describe("multipart plan", () => {
  it("cuts a file into equal parts with a short last part", () => {
    const size = 40 * MB + 123;
    expect(partCountFor(size, 16 * MB)).toBe(3);
    expect(partRange(1, size, 16 * MB)).toEqual({ start: 0, end: 16 * MB });
    expect(partRange(2, size, 16 * MB)).toEqual({ start: 16 * MB, end: 32 * MB });
    expect(partRange(3, size, 16 * MB)).toEqual({ start: 32 * MB, end: size });
  });

  it("never produces zero parts", () => {
    expect(partCountFor(1, 16 * MB)).toBe(1);
  });

  it("keeps the biggest allowed file under the R2 part cap", () => {
    expect(partCountFor(MAX_UPLOAD_BYTES, MULTIPART_PART_BYTES)).toBeLessThanOrEqual(
      MULTIPART_MAX_PARTS,
    );
    // R2 minimum part size is 5 MB.
    expect(MULTIPART_PART_BYTES).toBeGreaterThanOrEqual(5 * MB);
    // The threshold and the part size agree: a file that goes multipart has
    // at least one full part.
    expect(MULTIPART_THRESHOLD_BYTES).toBeGreaterThanOrEqual(MULTIPART_PART_BYTES);
  });

  it("lists only the parts without an etag, in order", () => {
    expect(remainingParts(5, { 1: "a", 3: "c" })).toEqual([2, 4, 5]);
    expect(remainingParts(3, {})).toEqual([1, 2, 3]);
    expect(remainingParts(2, { 1: "a", 2: "b" })).toEqual([]);
  });

  it("counts uploaded bytes from finished parts, ignoring junk keys", () => {
    const size = 40 * MB;
    const record = { partCount: 3, partSize: 16 * MB, etags: { 1: "a", 3: "c", 9: "x" } };
    // part 1 = 16 MB, part 3 = 8 MB (the short last part), part 9 ignored
    expect(uploadedBytes(record, size)).toBe(24 * MB);
  });
});

describe("resume", () => {
  const file = { name: "clip.mp4", size: 40 * MB, lastModified: 1700000000000 };
  const record: MultipartResumeRecord = {
    fingerprint: fileFingerprint(file),
    key: "uploads/u1/20261104/120000_abcd1234.mp4",
    uploadId: "upl-1",
    url: "https://cdn/uploads/u1/20261104/120000_abcd1234.mp4",
    partSize: 16 * MB,
    partCount: 3,
    etags: { 1: "a" },
    updatedAt: Date.now(),
  };

  it("fingerprints by name, size and lastModified", () => {
    expect(fileFingerprint(file)).toBe("clip.mp4|41943040|1700000000000");
    expect(fileFingerprint({ ...file, size: 1 })).not.toBe(fileFingerprint(file));
  });

  it("resumes only when the saved cut matches the file", () => {
    expect(isResumable(record, file, 16 * MB)).toBe(true);
    expect(isResumable(null, file, 16 * MB)).toBe(false);
    expect(isResumable({ ...record, partSize: 8 * MB }, file, 16 * MB)).toBe(false);
    expect(isResumable(record, { size: 100 * MB }, 16 * MB)).toBe(false);
    expect(isResumable({ ...record, etags: {} }, file, 16 * MB)).toBe(false);
    expect(isResumable({ ...record, uploadId: "" }, file, 16 * MB)).toBe(false);
  });

  it("labels progress for the bubble", () => {
    expect(partStatusLabel(7, 19, true)).toBe("Resuming part 7 of 19");
    expect(partStatusLabel(1, 3, false)).toBe("Part 1 of 3");
  });

  it("normalizes ETags", () => {
    expect(normalizeEtag('"abc123"')).toBe("abc123");
    expect(normalizeEtag('W/"abc"')).toBe("abc");
    expect(normalizeEtag("abc")).toBe("abc");
    expect(normalizeEtag(null)).toBeNull();
    expect(normalizeEtag('""')).toBeNull();
  });
});

describe("isDirectUploadBlocked (CORS not set up on the bucket)", () => {
  const base = { status: undefined, partsLanded: 0, online: true, attempt: 1 };

  it("flags a status-less failure on the first part after one retry, while online", () => {
    expect(isDirectUploadBlocked(base)).toBe(true);
    expect(isDirectUploadBlocked({ ...base, attempt: 4 })).toBe(true);
  });

  it("gives the very first attempt the benefit of the doubt", () => {
    expect(isDirectUploadBlocked({ ...base, attempt: 0 })).toBe(false);
  });

  it("is not a block when R2 answered, parts already landed, or the device is offline", () => {
    expect(isDirectUploadBlocked({ ...base, status: 403 })).toBe(false);
    expect(isDirectUploadBlocked({ ...base, status: 500 })).toBe(false);
    expect(isDirectUploadBlocked({ ...base, partsLanded: 3 })).toBe(false);
    expect(isDirectUploadBlocked({ ...base, online: false })).toBe(false);
  });
});
