import { describe, expect, it } from "vitest";
import {
  isBlockedFileType,
  resolveSafeMessageKind,
  validateMessageAttachments,
  validateUploadFile,
} from "@/lib/upload-validation";

describe("validateUploadFile", () => {
  it("rejects HTML, SVG, scripts, and executables by extension or MIME", () => {
    expect(isBlockedFileType("evil.html", "text/plain")).toBe(true);
    expect(isBlockedFileType("icon.svg", "image/png")).toBe(true);
    expect(isBlockedFileType("photo.png", "image/svg+xml")).toBe(true);
    expect(isBlockedFileType("doc.pdf", "text/html; charset=utf-8")).toBe(true);
    expect(isBlockedFileType("run.sh", "application/octet-stream")).toBe(true);

    const res = validateUploadFile({
      filename: "xss.svg",
      mimeType: "image/svg+xml",
      fileSize: 120,
      maxBytes: 1024 * 1024,
    });
    expect(res.ok).toBe(false);
  });

  it("allows normal photos, videos, audio, and documents", () => {
    const allowed = [
      { filename: "photo.jpg", mimeType: "image/jpeg" },
      { filename: "clip.mp4", mimeType: "video/mp4" },
      { filename: "voice.m4a", mimeType: "audio/mp4" },
      { filename: "report.pdf", mimeType: "application/pdf" },
    ];
    for (const f of allowed) {
      const res = validateUploadFile({ ...f, fileSize: 1024, maxBytes: 10_000 });
      expect(res.ok, `expected ${f.filename} allowed`).toBe(true);
    }
  });
});

describe("validateMessageAttachments", () => {
  const r2 = "https://pub-abc.r2.dev";

  it("rejects external URLs, javascript URLs, path traversal, and excess count", () => {
    expect(
      validateMessageAttachments(
        [{ filename: "a.png", url: "https://evil.example/a.png", mimeType: "image/png" }],
        { r2PublicUrl: r2 },
      ).ok,
    ).toBe(false);

    expect(
      validateMessageAttachments(
        [{ filename: "a.png", url: "javascript:alert(1)", mimeType: "image/png" }],
        { r2PublicUrl: r2 },
      ).ok,
    ).toBe(false);

    expect(
      validateMessageAttachments(
        [{ filename: "a.png", url: `${r2}/uploads/../secret/a.png`, mimeType: "image/png" }],
        { r2PublicUrl: r2 },
      ).ok,
    ).toBe(false);

    const eleven = Array.from({ length: 11 }, (_, i) => ({
      filename: `f${i}.png`,
      url: `${r2}/uploads/u1/f${i}.png`,
      mimeType: "image/png",
    }));
    expect(validateMessageAttachments(eleven, { r2PublicUrl: r2 }).ok).toBe(false);
  });

  it("accepts valid R2-hosted attachments", () => {
    const res = validateMessageAttachments(
      [{ filename: "photo.png", url: `${r2}/uploads/u1/photo.png`, mimeType: "image/png", fileSize: 500 }],
      { r2PublicUrl: r2 },
    );
    expect(res.ok).toBe(true);
  });
});

describe("resolveSafeMessageKind", () => {
  it("strips spoofed system card kinds when internal token is missing or wrong", () => {
    expect(resolveSafeMessageKind("deadline_reminder", undefined, "secret")).toBe("message");
    expect(resolveSafeMessageKind("deadline_reminder", "wrong", "secret")).toBe("message");
    expect(resolveSafeMessageKind("proof_bypass", "secret", "secret")).toBe("proof_bypass");
  });
});
