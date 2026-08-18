"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function updateMyName(name: string): Promise<Result<null>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) throw new Error("Unauthorized");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");

    // Mirror into Clerk (best-effort) so the auth profile matches everywhere.
    try {
      const client = await clerkClient();
      const [firstName, ...rest] = trimmed.split(/\s+/);
      await client.users.updateUser(clerkId, {
        firstName,
        lastName: rest.join(" "),
      });
    } catch {}

    await prisma.user.updateMany({
      where: { clerkId },
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
    const { userId: clerkId } = await auth();
    if (!clerkId) throw new Error("Unauthorized");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("No image selected");
    if (!file.type.startsWith("image/")) throw new Error("File must be an image");
    if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");

    // Clerk hosts profile images at a stable URL, which is what the rest of the
    // app (sidebar, chat, mentions) already renders.
    const client = await clerkClient();
    const updated = await client.users.updateUserProfileImage(clerkId, { file });

    await prisma.user.updateMany({
      where: { clerkId },
      data: { imageUrl: updated.imageUrl },
    });
    revalidatePath("/dashboard/account");
    revalidatePath("/setup-photo");
    revalidatePath("/dashboard");
    return { ok: true, data: { imageUrl: updated.imageUrl } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
