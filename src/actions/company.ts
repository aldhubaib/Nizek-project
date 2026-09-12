"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";

export type CompanyDTO = {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Just enough to fill the company dropdown on the contact form. */
export type CompanyOption = { id: string; name: string };

export type CompanyInput = {
  name: string;
  website?: string | null;
  notes?: string | null;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type CompanyRow = {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { contacts: number };
};

function toDTO(row: CompanyRow): CompanyDTO {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    notes: row.notes,
    contactCount: row._count.contacts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function companyAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[companies:${label}]`, err);
    return { ok: false, error };
  }
}

function cleanInput(input: CompanyInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Company name is required");

  // Typed as "acme.com" far more often than with a scheme, and a bare host
  // won't open as a link — so assume https rather than rejecting it.
  let website = input.website?.trim() || null;
  if (website && !/^https?:\/\//i.test(website)) {
    website = `https://${website}`;
  }

  return { name, website, notes: input.notes?.trim() || null };
}

export async function listCompanies(): Promise<CompanyDTO[]> {
  await requireContactsAccess();
  const rows = await prisma.company.findMany({
    include: { _count: { select: { contacts: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map(toDTO);
}

export async function listCompanyOptions(): Promise<CompanyOption[]> {
  await requireContactsAccess();
  return prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function createCompany(
  input: CompanyInput,
): Promise<ActionResult<CompanyDTO>> {
  return companyAction("create", async () => {
    const user = await requireContactsAccess();
    const data = cleanInput(input);

    const clash = await prisma.company.findUnique({
      where: { name: data.name },
      select: { id: true },
    });
    if (clash) throw new Error(`“${data.name}” is already in the list`);

    const created = await prisma.company.create({
      data: { ...data, createdById: user.id },
      include: { _count: { select: { contacts: true } } },
    });

    revalidatePath("/dashboard/companies");
    revalidatePath("/dashboard/contacts");
    return toDTO(created);
  });
}

export async function updateCompany(
  id: string,
  input: CompanyInput,
): Promise<ActionResult<CompanyDTO>> {
  return companyAction("update", async () => {
    await requireContactsAccess();
    const data = cleanInput(input);

    const clash = await prisma.company.findUnique({
      where: { name: data.name },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      throw new Error(`“${data.name}” is already in the list`);
    }

    const updated = await prisma.company.update({
      where: { id },
      data,
      include: { _count: { select: { contacts: true } } },
    });

    revalidatePath("/dashboard/companies");
    revalidatePath("/dashboard/contacts");
    return toDTO(updated);
  });
}

/**
 * Deleting a company keeps its people: the schema clears `companyId` rather
 * than cascading, so they stay in the directory without an organisation.
 */
export async function deleteCompany(
  id: string,
): Promise<ActionResult<{ id: string; unlinkedContacts: number }>> {
  return companyAction("delete", async () => {
    await requireContactsAccess();
    const existing = await prisma.company.findUnique({
      where: { id },
      select: { _count: { select: { contacts: true } } },
    });
    if (!existing) throw new Error("That company no longer exists");

    await prisma.company.delete({ where: { id } });

    revalidatePath("/dashboard/companies");
    revalidatePath("/dashboard/contacts");
    return { id, unlinkedContacts: existing._count.contacts };
  });
}
