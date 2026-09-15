import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Issue the next sequential id for a module.
 *
 * Deals, contacts, and companies share one workspace sequence each
 * (`scopeId` empty). The project Board sequences per project.
 */
export async function takeNextRecordNumber(
  db: Db,
  entityType: string,
  scopeId = "",
): Promise<number> {
  const rows = await db.$queryRaw<{ nextNumber: number }[]>`
    INSERT INTO "ModuleRecordCounter" ("entityType", "scopeId", "nextNumber")
    VALUES (${entityType}, ${scopeId}, 1)
    ON CONFLICT ("entityType", "scopeId")
    DO UPDATE SET "nextNumber" = "ModuleRecordCounter"."nextNumber" + 1
    RETURNING "nextNumber"
  `;
  return Number(rows[0]?.nextNumber ?? 1);
}

export function formatRecordNumber(n: number): string {
  return `#${n}`;
}
