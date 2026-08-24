"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateR2Key, uploadToR2 } from "@/lib/r2";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function updateMyName(name: string): Promise<Result<null>> {
  try {
    const user = await requireUser();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");

    await prisma.user.update({
      where: { id: user.id },
      data: { name: trimmed },
    });
    revalidatePath("/dashboard/account");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function updateMyAvatar(
  formData: FormData,
): Promise<Result<{ imageUrl: string }>> {
  try {
    const user = await requireUser();

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("No image selected");
    if (!file.type.startsWith("image/")) throw new Error("File must be an image");
    if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");

    const bytes = Buffer.from(await file.arrayBuffer());
    const key = generateR2Key("avatar", file.name || "avatar.jpg");
    const imageUrl = await uploadToR2(bytes, key, file.type);

    await prisma.user.update({
      where: { id: user.id },
      data: { imageUrl },
    });
    revalidatePath("/dashboard/account");
    revalidatePath("/setup-photo");
    revalidatePath("/dashboard");
    return { ok: true, data: { imageUrl } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
