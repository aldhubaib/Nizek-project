import { Prisma } from "@/generated/prisma/client";

/** WHERE fragment selecting Message rows that belong to a mobile thread target. */
export function threadScopeSql(target: {
  taskId?: string;
  projectId?: string;
  conversationId?: string;
}): Prisma.Sql | null {
  if (target.taskId) return Prisma.sql`m."taskId" = ${target.taskId}`;
  if (target.conversationId) return Prisma.sql`m."conversationId" = ${target.conversationId}`;
  if (target.projectId) {
    return Prisma.sql`m."conversationId" IS NULL AND m."projectId" = ${target.projectId}`;
  }
  return null;
}
