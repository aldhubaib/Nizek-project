// Browser -> R2 upload. Primary path is a presigned direct-to-R2 PUT (no file
// bytes through our server). Cross-origin PUTs can fail on some mobile browsers
// and PWAs (CORS preflight quirks), so we transparently fall back to a
// same-origin proxy upload (/api/upload) which has no CORS to trip over.

export type UploadedFile = {
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string | null;
};

export async function uploadFileToR2(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedFile> {
  try {
    return await uploadViaPresign(file, onProgress);
  } catch {
    // Direct-to-R2 failed (commonly CORS/network on mobile/PWA). Retry through
    // our own origin, which always works cross-device.
    return await uploadViaServer(file, onProgress);
  }
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
    throw new Error(`Upload prep failed (${presignRes.status})`);
  }
  const { uploadUrl, url } = (await presignRes.json()) as {
    uploadUrl: string;
    url: string;
  };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });

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

  return await new Promise<UploadedFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        // Cap at 99% until the server responds so it doesn't jump to done early.
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as {
            url: string;
            filename?: string;
            fileSize?: number;
            mimeType?: string | null;
          };
          onProgress?.(100);
          resolve({
            filename: data.filename ?? file.name,
            url: data.url,
            fileSize: data.fileSize ?? file.size,
            mimeType: data.mimeType ?? (file.type || null),
          });
        } catch {
          reject(new Error("Bad upload response"));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}
