import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * How long a presigned upload link stays valid. A single PUT of a 300 MB
 * phone video takes well over the old 5 minutes on 4G, and R2 rejects the
 * request the moment the signature expires mid-transfer — which is exactly the
 * "big videos never finish" failure. The link only authorises one key, so a
 * longer life costs nothing.
 */
export const PRESIGN_EXPIRES_SECONDS = 60 * 60;

// Issue a presigned PUT URL so the browser can upload straight to R2 (no
// server-as-proxy, no in-heap buffers). Returns the URL to PUT to and the
// eventual public URL of the object.
export async function presignPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = PRESIGN_EXPIRES_SECONDS,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const uploadUrl = await getSignedUrl(
    R2,
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSeconds },
  );
  return { uploadUrl, publicUrl: `${process.env.R2_PUBLIC_URL}/${key}` };
}

// ─── Multipart (resumable) uploads ───────────────────────────────────────────
//
// Big files are cut into parts. The browser asks us to start the upload, gets
// a signed link per part, PUTs each part straight to R2 (retrying only the
// parts that fail), then asks us to stitch them together. Nothing passes
// through our server, and an interrupted upload can continue from the parts
// that already landed. See docs/uploads.md for the bucket CORS this needs.

export type MultipartPart = { partNumber: number; etag: string };

export async function createMultipartUpload(
  key: string,
  contentType: string,
): Promise<{ uploadId: string; publicUrl: string }> {
  const res = await R2.send(
    new CreateMultipartUploadCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    }),
  );
  if (!res.UploadId) throw new Error("R2 did not return an UploadId");
  return { uploadId: res.UploadId, publicUrl: `${process.env.R2_PUBLIC_URL}/${key}` };
}

/** Signed PUT link for one part. The browser reads the ETag from the response. */
export async function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = PRESIGN_EXPIRES_SECONDS,
): Promise<string> {
  return getSignedUrl(
    R2,
    new UploadPartCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: MultipartPart[],
): Promise<string> {
  const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  await R2.send(
    new CompleteMultipartUploadCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: ordered.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await R2.send(
    new AbortMultipartUploadCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      UploadId: uploadId,
    }),
  );
}

/**
 * Multipart uploads that were started but never completed or aborted. Their
 * parts are billed storage until something aborts them — the daily cron does.
 */
export async function listStaleMultipartUploads(
  olderThanMs: number,
  prefix = "uploads/",
): Promise<Array<{ key: string; uploadId: string; initiated: Date }>> {
  const cutoff = Date.now() - olderThanMs;
  const stale: Array<{ key: string; uploadId: string; initiated: Date }> = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  // Bounded loop: a bucket should never have thousands of dangling uploads.
  for (let page = 0; page < 20; page++) {
    const res = await R2.send(
      new ListMultipartUploadsCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Prefix: prefix,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
        MaxUploads: 1000,
      }),
    );
    for (const u of res.Uploads ?? []) {
      if (!u.Key || !u.UploadId || !u.Initiated) continue;
      if (u.Initiated.getTime() < cutoff) {
        stale.push({ key: u.Key, uploadId: u.UploadId, initiated: u.Initiated });
      }
    }
    if (!res.IsTruncated) break;
    keyMarker = res.NextKeyMarker;
    uploadIdMarker = res.NextUploadIdMarker;
    if (!keyMarker && !uploadIdMarker) break;
  }
  return stale;
}

export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  await R2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/**
 * Read an object back into memory. Used when the server has to re-derive
 * something from an asset a user uploaded earlier — going through the API
 * rather than the public URL keeps it working for private buckets.
 */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const res = await R2.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
  );
  if (!res.Body) throw new Error(`R2 object ${key} is empty`);
  return Buffer.from(await res.Body.transformToByteArray());
}

export function generateR2Key(prefix: string, filename: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = crypto.randomUUID().slice(0, 8);
  const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
  return `${prefix}/${date}/${time}_${rand}.${ext}`;
}

export function extractR2Key(url: string): string | null {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl || !url.startsWith(publicUrl)) return null;
  return url.slice(publicUrl.length + 1);
}

export async function deleteFromR2(key: string): Promise<void> {
  await R2.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
  );
}

export async function deleteManyFromR2(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await R2.send(
    new DeleteObjectsCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}
