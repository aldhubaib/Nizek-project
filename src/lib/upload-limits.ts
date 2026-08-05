// Single source of truth for attachment upload size limits.
//
// Direct-to-R2 presigned PUTs never pass file bytes through our server, so the
// ceiling is generous. The same-origin proxy fallback (/api/upload) buffers the
// whole file in server memory, so it stays deliberately small.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_UPLOAD_LABEL = "500MB";

export const MAX_PROXY_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
