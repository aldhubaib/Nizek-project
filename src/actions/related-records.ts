"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { formatPhone } from "@/lib/dial-codes";
import { industryLabel } from "@/lib/industries";
import { getModule } from "@/lib/modules/registry";
import { takeNextRecordNumber } from "@/lib/modules/record-number";
import { logRecordCreated } from "@/lib/modules/record-history";
import {
  type RelatedRecordCatalog,
  type RelatedRecordOption,
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

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function namesFromTitle(title: string) {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || title || "Untitled",
    lastName: parts.slice(1).join(" "),
  };
}

async function firstDirectoryFlow(entityType: "company" | "contact" | "deal") {
  const first = await prisma.workflow.findFirst({
    where:
      entityType === "deal"
        ? { entityType: "deal" }
        : { entityType, projectId: "" },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!first) {
    throw new Error(
      entityType === "deal"
        ? "Create a deal flow first"
        : `Create a ${entityType} flow first`,
    );
  }
  return first.id;
}

async function firstStageId(flowId: string) {
  const first = await prisma.workflowStatus.findFirst({
    where: { workflowId: flowId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

/** Quick-create a company, contact, or deal from a relation picker and link it. */
export async function createRelatedRecord(
  model: RelationModel,
  title: string,
): Promise<ActionResult<RelatedRecordOption>> {
  try {
    const user = await requireContactsAccess();
    const name = title.trim();
    if (!name) throw new Error("Enter a name");
    if (name.length > 160) throw new Error("Keep the name under 160 characters");
    if (model === "user") throw new Error("Pick someone from the team");

    if (model === "company") {
      const existing = await prisma.company.findUnique({
        where: { nameEn: name },
        select: { id: true, nameEn: true, industry: true },
      });
      if (existing) {
        return {
          ok: true,
          data: {
            id: existing.id,
            title: existing.nameEn,
            subtitle: industryLabel(existing.industry) ?? "",
            href: `/dashboard/companies/${existing.id}`,
          },
        };
      }
      const flowId = await firstDirectoryFlow("company");
      const statusId = await firstStageId(flowId);
      const created = await prisma.$transaction(async (tx) => {
        const recordNumber = await takeNextRecordNumber(tx, "company");
        return tx.company.create({
          data: {
            recordNumber,
            nameEn: name,
            nameAr: "",
            industry: "",
            countries: [],
            workflowId: flowId,
            statusId,
            createdById: user.id,
          },
        });
      });
      await logRecordCreated({
        entityType: "company",
        recordId: created.id,
        userId: user.id,
        title: created.nameEn,
        recordWord: "company",
      });
      for (const path of getModule("company").revalidatePaths) revalidatePath(path);
      return {
        ok: true,
        data: {
          id: created.id,
          title: created.nameEn,
          subtitle: "",
          href: `/dashboard/companies/${created.id}`,
        },
      };
    }

    if (model === "contact") {
      const flowId = await firstDirectoryFlow("contact");
      const statusId = await firstStageId(flowId);
      const names = namesFromTitle(name);
      const created = await prisma.$transaction(async (tx) => {
        const recordNumber = await takeNextRecordNumber(tx, "contact");
        return tx.contact.create({
          data: {
            recordNumber,
            title: name,
            firstName: names.firstName,
            lastName: names.lastName,
            workflowId: flowId,
            statusId,
            createdById: user.id,
          },
        });
      });
      await logRecordCreated({
        entityType: "contact",
        recordId: created.id,
        userId: user.id,
        title: created.title,
        recordWord: "contact",
      });
      for (const path of getModule("contact").revalidatePaths) revalidatePath(path);
      return {
        ok: true,
        data: {
          id: created.id,
          title: created.title || `${created.firstName} ${created.lastName}`.trim(),
          subtitle: "",
          href: `/dashboard/contacts/${created.id}`,
        },
      };
    }

    const flowId = await firstDirectoryFlow("deal");
    const statusId = await firstStageId(flowId);
    const created = await prisma.$transaction(async (tx) => {
      const recordNumber = await takeNextRecordNumber(tx, "deal");
      return tx.deal.create({
        data: {
          recordNumber,
          title: name,
          workflowId: flowId,
          statusId,
          createdById: user.id,
        },
        include: { workflow: { select: { name: true } } },
      });
    });
    await logRecordCreated({
      entityType: "deal",
      recordId: created.id,
      userId: user.id,
      title: created.title,
      recordWord: "deal",
    });
    for (const path of getModule("deal").revalidatePaths) revalidatePath(path);
    return {
      ok: true,
      data: {
        id: created.id,
        title: created.title,
        subtitle: created.workflow.name,
        href: `/dashboard/deals/${created.id}`,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error("[related-records:create]", err);
    return { ok: false, error };
  }
}
