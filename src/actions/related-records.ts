"use server";

import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { formatPhone } from "@/lib/dial-codes";
import { industryLabel } from "@/lib/industries";
import {
  type RelatedRecordCatalog,
  type RelationModel,
} from "@/lib/fields/relations";

export type { RelatedRecordCatalog, RelatedRecordOption } from "@/lib/fields/relations";

/** Records a Relation field can attach, keyed by the model it links to. */
export async function listRelatedRecordOptions(opts?: {
  excludeDealId?: string;
}): Promise<RelatedRecordCatalog> {
  await requireContactsAccess();

  const [companies, contacts, deals, users] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, nameEn: true, industry: true },
      orderBy: { nameEn: "asc" },
      take: 400,
    }),
    prisma.contact.findMany({
      select: {
        id: true,
        title: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneCountry: true,
        phoneNumber: true,
      },
      orderBy: [{ title: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
      take: 400,
    }),
    prisma.deal.findMany({
      where: opts?.excludeDealId ? { id: { not: opts.excludeDealId } } : undefined,
      select: {
        id: true,
        title: true,
        workflow: { select: { name: true } },
      },
      orderBy: { title: "asc" },
      take: 400,
    }),
    prisma.user.findMany({
      where: { blocked: false },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return {
    company: companies.map((row) => ({
      id: row.id,
      title: row.nameEn,
      subtitle: industryLabel(row.industry) ?? "",
      href: `/dashboard/companies/${row.id}`,
    })),
    contact: contacts.map((row) => ({
      id: row.id,
      title: row.title || `${row.firstName} ${row.lastName}`.trim(),
      subtitle: row.email || formatPhone(row.phoneCountry, row.phoneNumber),
      href: `/dashboard/contacts/${row.id}`,
    })),
    deal: deals.map((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.workflow.name,
      href: `/dashboard/deals/${row.id}`,
    })),
    user: users.map((row) => ({
      id: row.id,
      title: row.name?.trim() || row.email,
      subtitle: row.email,
      href: "",
    })),
  };
}

export async function countRelatedRecords(
  model: RelationModel,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const where = { id: { in: ids } };
  switch (model) {
    case "company":
      return prisma.company.count({ where });
    case "contact":
      return prisma.contact.count({ where });
    case "deal":
      return prisma.deal.count({ where });
    case "user":
      return prisma.user.count({ where: { ...where, blocked: false } });
    default: {
      const _never: never = model;
      throw new Error(`Unknown related model: ${_never}`);
    }
  }
}
