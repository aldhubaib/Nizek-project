// Single source of truth for attachment upload size limits.
//
// Direct-to-R2 uploads (single presigned PUT for small files, multipart for
// big ones) never pass file bytes through our server, so the ceiling is
// generous. The same-origin proxy fallback (/api/upload) buffers the whole
// file in server memory, so it stays small and is only used for small files
// on browsers with CORS quirks (matches proxyClientMaxBodySize in next.config).
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_UPLOAD_LABEL = "2GB";

export const MAX_PROXY_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_PROXY_UPLOAD_LABEL = "100MB";

/**
 * Files at or above this size go through the multipart (resumable) path.
 * Below it a single PUT is simpler and fast enough. Also the hard ceiling for
 * the proxy fallback: anything bigger must never be buffered on the server.
 */
export const MULTIPART_THRESHOLD_BYTES = 16 * 1024 * 1024; // 16 MB

/**
 * Size of each multipart part. R2 requires every part except the last to be
 * the same size and at least 5 MB. 16 MB keeps a 2 GB file at 128 parts,
 * well under the 10,000-part cap, while a lost part costs little to redo.
 */
export const MULTIPART_PART_BYTES = 16 * 1024 * 1024; // 16 MB

/** S3/R2 hard limit on part numbers. */
export const MULTIPART_MAX_PARTS = 10_000;

/** How many part links the sign route hands out per request. */
export const MULTIPART_SIGN_BATCH_MAX = 200;
