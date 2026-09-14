"use server";

import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";

/** Enough for the contact dropdown and the deal related-data table. */
export type CompanyOption = {
  id: string;
  name: string;
  website: string | null;
  industry: string;
};

export async function listCompanyOptions(): Promise<CompanyOption[]> {
  await requireContactsAccess();
  const rows = await prisma.company.findMany({
    select: { id: true, nameEn: true, website: true, industry: true },
    orderBy: { nameEn: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.nameEn,
    website: row.website,
    industry: row.industry,
  }));
}
