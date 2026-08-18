// Single source of truth for attachment upload size limits.
//
// Direct-to-R2 presigned PUTs never pass file bytes through our server, so the
// ceiling is generous. The same-origin proxy fallback (/api/upload) buffers the
// whole file in server memory, so it stays smaller — but big enough to cover
// most videos when the direct PUT fails (matches proxyClientMaxBodySize in
// next.config).
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_UPLOAD_LABEL = "500MB";

export const MAX_PROXY_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_PROXY_UPLOAD_LABEL = "100MB";
