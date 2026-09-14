"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";

export type ContactsMember = {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
};

/** Just enough to fill a picker that attaches a contact to a deal. */
export type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneCountry: string;
  phoneNumber: string;
};

export async function listContactOptions(): Promise<ContactOption[]> {
  await requireContactsAccess();
  const rows = await prisma.contact.findMany({
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
  });
  return rows.map((row) => {
    const fallback = `${row.firstName} ${row.lastName}`.trim();
    const parts = (row.title || fallback).split(/\s+/);
    return {
      id: row.id,
      firstName: row.firstName || parts[0] || row.title,
      lastName: row.lastName || parts.slice(1).join(" "),
      email: row.email,
      phoneCountry: row.phoneCountry,
      phoneNumber: row.phoneNumber,
    };
  });
}

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

/** Grants or revokes one user's access to Contacts, Companies and Deals. */
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

  revalidatePath("/dashboard/admin");
  revalidatePath("/", "layout");
  return { ok: true };
}
