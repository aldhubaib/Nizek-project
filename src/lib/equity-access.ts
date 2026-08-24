import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * The Equity module is private: only users holding an EquityPermission row can
 * see the nav entry, open the pages, or call the server actions.
 *
 * Admins are deliberately *not* implicit here, unlike the Audit module. This is
 * private financial data, so everyone who can read it is an explicit row that
 * can be listed and revoked — an admin who needs access grants it to themselves
 * from Admin → Equity Access, which leaves a record of who did it.
 */
export const canAccessEquity = cache(async function canAccessEquity(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const count = await prisma.equityPermission.count({ where: { userId } });
  return count > 0;
});
