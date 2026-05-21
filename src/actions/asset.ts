"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireProjectRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createAsset(data: {
  projectId: string;
  filename: string;
  url: string;
  fileSize?: number;
  mimeType?: string;
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot upload assets");

  const asset = await prisma.asset.create({
    data: {
      filename: data.filename,
      url: data.url,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      projectId: data.projectId,
      uploadedById: user.id,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return asset;
}

export async function deleteAsset(assetId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { project: true },
  });
  if (!asset) throw new Error("Asset not found");

  await requireProjectRole(asset.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  await prisma.asset.delete({ where: { id: assetId } });
  revalidatePath(`/dashboard/projects/${asset.projectId}`);
}

export async function getAssets(projectId: string) {
  await requireProjectMember(projectId);

  return prisma.asset.findMany({
    where: { projectId },
    include: { uploadedBy: true },
    orderBy: { createdAt: "desc" },
  });
}
