import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

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
