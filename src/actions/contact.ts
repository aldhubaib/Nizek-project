"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { isDialCountry, normalizePhoneNumber } from "@/lib/dial-codes";

export type ContactDTO = {
  id: string;
  firstName: string;
  lastName: string;
  phoneCountry: string;
  phoneNumber: string;
  email: string | null;
  role: string | null;
  companyId: string | null;
  companyName: string | null;
  /** Null means the board shows this contact under "Unassigned". */
  stageId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactsMember = {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
};

export type ContactInput = {
  firstName: string;
  lastName: string;
  phoneCountry: string;
  phoneNumber: string;
  email?: string | null;
  role?: string | null;
  companyId?: string | null;
  stageId?: string | null;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shortest number we'll accept once the dialling code is off the front. */
const MIN_PHONE_DIGITS = 4;

const CONTACT_INCLUDE = {
  company: { select: { id: true, name: true } },
} as const;

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  phoneCountry: string;
  phoneNumber: string;
  email: string | null;
  role: string | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  stageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(row: ContactRow): ContactDTO {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phoneCountry: row.phoneCountry,
    phoneNumber: row.phoneNumber,
    email: row.email,
    role: row.role,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    stageId: row.stageId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Thrown errors are redacted in production for server actions, so every
 * mutation the UI calls comes back as a result it can render instead.
 */
async function contactAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[contacts:${label}]`, err);
    return { ok: false, error };
  }
}

/**
 * The required three plus whichever optional fields were filled in, ready for
 * Prisma. Shared by create and update so both reject the same input.
 */
async function cleanInput(input: ContactInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) throw new Error("First name is required");
  if (!lastName) throw new Error("Last name is required");

  const phoneCountry = input.phoneCountry.trim().toUpperCase();
  if (!isDialCountry(phoneCountry)) {
    throw new Error("Pick a country for the phone number");
  }
  const phoneNumber = normalizePhoneNumber(phoneCountry, input.phoneNumber);
  if (phoneNumber.length < MIN_PHONE_DIGITS) {
    throw new Error("Enter a phone number");
  }

  const email = input.email?.trim() || null;
  if (email && !EMAIL_PATTERN.test(email)) {
    throw new Error("That email address doesn't look right");
  }

  const role = input.role?.trim() || null;

  // Never trust the ids the form sent — a stale picker could point at a company
  // or column somebody else has since deleted.
  const companyId = input.companyId?.trim() || null;
  if (companyId) {
    const exists = await prisma.company.count({ where: { id: companyId } });
    if (!exists) throw new Error("That company no longer exists");
  }

  const stageId = input.stageId?.trim() || null;
  if (stageId) {
    const exists = await prisma.contactStage.count({ where: { id: stageId } });
    if (!exists) throw new Error("That column no longer exists");
  }

  return {
    firstName,
    lastName,
    phoneCountry,
    phoneNumber,
    email,
    role,
    companyId,
    stageId,
  };
}

/** The leftmost column, where a contact added without one lands. */
async function firstStageId(): Promise<string | null> {
  const first = await prisma.contactStage.findFirst({
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

export async function listContacts(): Promise<ContactDTO[]> {
  await requireContactsAccess();
  const rows = await prisma.contact.findMany({
    include: CONTACT_INCLUDE,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map(toDTO);
}

export async function createContact(
  input: ContactInput,
): Promise<ActionResult<ContactDTO>> {
  return contactAction("create", async () => {
    const user = await requireContactsAccess();
    const data = await cleanInput(input);

    const created = await prisma.contact.create({
      data: {
        ...data,
        // Added from the board without picking a column: start at the front of
        // the pipeline rather than in Unassigned.
        stageId: data.stageId ?? (await firstStageId()),
        createdById: user.id,
      },
      include: CONTACT_INCLUDE,
    });

    revalidatePath("/dashboard/contacts");
    revalidatePath("/dashboard/companies");
    return toDTO(created);
  });
}

export async function updateContact(
  id: string,
  input: ContactInput,
): Promise<ActionResult<ContactDTO>> {
  return contactAction("update", async () => {
    await requireContactsAccess();
    const data = await cleanInput(input);

    const updated = await prisma.contact.update({
      where: { id },
      data,
      include: CONTACT_INCLUDE,
    });

    revalidatePath("/dashboard/contacts");
    revalidatePath("/dashboard/companies");
    return toDTO(updated);
  });
}

export async function deleteContact(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return contactAction("delete", async () => {
    await requireContactsAccess();
    await prisma.contact.delete({ where: { id } });

    revalidatePath("/dashboard/contacts");
    revalidatePath("/dashboard/companies");
    return { id };
  });
}

// ─── Admin: permission management ───────────────────────
// Guarded on ADMIN rather than on contacts access, so an admin who holds no
// grant can still hand one out, including to themselves.

export async function getContactsPermissionAdminData(): Promise<{
  members: ContactsMember[];
  allowedUserIds: string[];
}> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const [members, permissions] = await Promise.all([
    prisma.user.findMany({
      where: { blocked: false, systemRole: { not: "CLIENT" } },
      select: { id: true, name: true, email: true, imageUrl: true },
      orderBy: { name: "asc" },
    }),
    prisma.contactsPermission.findMany({ select: { userId: true } }),
  ]);

  return { members, allowedUserIds: permissions.map((p) => p.userId) };
}

/** Grants or revokes one user's access to Contacts and Companies. */
export async function setUserContactsAccess(
  userId: string,
  allowed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireUser();
  if (admin.systemRole !== "ADMIN") return { ok: false, error: "Admin only" };

  if (allowed) {
    await prisma.contactsPermission.upsert({
      where: { userId },
      create: { userId, grantedById: admin.id },
      update: {},
    });
  } else {
    await prisma.contactsPermission.deleteMany({ where: { userId } });
  }

  // The nav is computed in the dashboard layout, so the whole shell has to be
  // rebuilt for the Contacts entries to appear or disappear.
  revalidatePath("/dashboard/admin");
  revalidatePath("/", "layout");
  return { ok: true };
}
