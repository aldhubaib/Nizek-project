import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { MULTIPART_MAX_PARTS } from "@/lib/upload-limits";

/**
 * Shared plumbing for the /api/upload/multipart/* routes: who is calling, and
 * whether the R2 key they name is one of theirs. Keys are minted by
 * generateR2Key(`uploads/${userId}`, …) so ownership is just the prefix; the
 * extra character checks stop path tricks like `uploads/me/../other/x`.
 */

export type MultipartCaller = { userId: string };

export async function requireUploadCaller(
  req: NextRequest,
): Promise<MultipartCaller | NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: session.user.id };
}

export function ownsUploadKey(userId: string, key: unknown): key is string {
  if (typeof key !== "string" || key.length === 0 || key.length > 512) return false;
  if (!key.startsWith(`uploads/${userId}/`)) return false;
  if (key.includes("..") || key.includes("//") || key.includes("\\")) return false;
  return /^[\w./-]+$/.test(key);
}

export function isUploadId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048;
}

export function isPartNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MULTIPART_MAX_PARTS
  );
}

export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });
