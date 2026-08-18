"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateR2Key, uploadToR2, deleteFromR2 } from "@/lib/r2";

export type LoginPhotoDTO = {
  id: string;
  url: string;
  column: "a" | "b";
};

const MAX_LOGIN_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

async function requireLoginEditor() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Permission denied");
  return user;
}

function normalizeColumn(value: unknown): "a" | "b" {
  return value === "b" ? "b" : "a";
}

export async function getLoginPhotos(): Promise<LoginPhotoDTO[]> {
  await requireLoginEditor();
  const photos = await prisma.loginPhoto.findMany({
    orderBy: [{ column: "asc" }, { order: "asc" }, { createdAt: "asc" }],
  });
  return photos.map((p) => ({
    id: p.id,
    url: p.url,
    column: p.column === "b" ? "b" : "a",
  }));
}

export async function addLoginPhoto(formData: FormData): Promise<void> {
  await requireLoginEditor();
  const file = formData.get("file");
  const column = normalizeColumn(formData.get("column"));
  if (!(file instanceof File) || file.size === 0)
    throw new Error("No image provided");
  if (!file.type.startsWith("image/"))
    throw new Error("Only image files are allowed");
  if (file.size > MAX_LOGIN_PHOTO_BYTES)
    throw new Error(
      `Image is too large. Maximum is ${MAX_LOGIN_PHOTO_BYTES / (1024 * 1024)} MB.`,
    );

  const key = generateR2Key("login_photo", file.name || "photo.jpg");
  const bytes = Buffer.from(await file.arrayBuffer());
  const url = await uploadToR2(
    bytes,
    key,
    file.type || "application/octet-stream",
  );

  const last = await prisma.loginPhoto.findFirst({
    where: { column },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.loginPhoto.create({
    data: {
      url,
      r2Key: key,
      contentType: file.type || null,
      column,
      order: (last?.order ?? -1) + 1,
    },
  });
}

export async function removeLoginPhoto(id: string): Promise<void> {
  await requireLoginEditor();
  const photo = await prisma.loginPhoto.findUnique({ where: { id } });
  if (!photo) return;
  await deleteFromR2(photo.r2Key).catch(() => {});
  await prisma.loginPhoto.delete({ where: { id } });
}

export async function setLoginPhotoColumn(
  id: string,
  column: "a" | "b",
): Promise<void> {
  await requireLoginEditor();
  const col = normalizeColumn(column);
  const last = await prisma.loginPhoto.findFirst({
    where: { column: col },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.loginPhoto.update({
    where: { id },
    data: { column: col, order: (last?.order ?? -1) + 1 },
  });
}
