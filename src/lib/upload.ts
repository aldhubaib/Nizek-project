// Direct-to-R2 upload from the browser using a presigned PUT URL. The server
// only issues the signed URL (see /api/upload/presign); file bytes never pass
// through the Node server, so there's no in-heap buffering / OOM risk under
// concurrent uploads.

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
