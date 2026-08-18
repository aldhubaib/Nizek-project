import { prisma } from "@/lib/prisma";

export async function logTaskActivity(data: {
  taskId: string;
  userId: string;
  action: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  return prisma.taskActivity.create({
    data: {
      taskId: data.taskId,
      userId: data.userId,
      action: data.action,
      field: data.field,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
    },
  });
}
