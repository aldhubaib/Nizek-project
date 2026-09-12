import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Contacts and Companies are one module behind one grant: anyone holding a
 * ContactsPermission row sees both nav entries, both pages, and can call the
 * actions for either.
 *
 * Admins are not implicit, the way they aren't for Equity. The directory holds
 * clients' and partners' personal phone numbers, so everyone who can read it is
 * an explicit row that can be listed and revoked — an admin who needs access
 * grants it to themselves from Admin → Contacts Access, which records who did.
 */
export const canAccessContacts = cache(async function canAccessContacts(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const count = await prisma.contactsPermission.count({ where: { userId } });
  return count > 0;
});

/**
 * The gate every contacts, companies and stage action opens with. Shared so the
 * three action files cannot drift apart on who is allowed in.
 */
export async function requireContactsAccess() {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) {
    throw new Error("Unauthorized");
  }
  return user;
}
