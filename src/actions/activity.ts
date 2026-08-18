"use server";

import { prisma } from "@/lib/prisma";

export async function getTaskActivities(taskId: string) {
  return prisma.taskActivity.findMany({
    where: { taskId },
    include: { user: { select: { id: true, name: true, imageUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
}
