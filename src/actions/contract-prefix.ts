"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function getContractPrefixes() {
  await requireUser();
  return prisma.contractPrefix.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { contracts: true } } },
  });
}

export async function createContractPrefix(data: { prefix: string; name: string }) {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const normalized = data.prefix.toUpperCase().trim();
  if (!normalized) throw new Error("Prefix is required");
  if (!data.name.trim()) throw new Error("Name is required");

  const existing = await prisma.contractPrefix.findUnique({ where: { prefix: normalized } });
  if (existing) return { error: `Prefix "${normalized}" already exists` };

  return prisma.contractPrefix.create({
    data: { prefix: normalized, name: data.name.trim() },
  });
}

export async function updateContractPrefix(data: { id: string; prefix: string; name: string }) {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const normalized = data.prefix.toUpperCase().trim();
  if (!normalized) throw new Error("Prefix is required");
  if (!data.name.trim()) throw new Error("Name is required");

  const existing = await prisma.contractPrefix.findFirst({
    where: { prefix: normalized, id: { not: data.id } },
  });
  if (existing) return { error: `Prefix "${normalized}" already exists` };

  return prisma.contractPrefix.update({
    where: { id: data.id },
    data: { prefix: normalized, name: data.name.trim() },
  });
}

export async function deleteContractPrefix(id: string) {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const prefix = await prisma.contractPrefix.findUnique({
    where: { id },
    include: { _count: { select: { contracts: true } } },
  });
  if (!prefix) throw new Error("Not found");
  if (prefix._count.contracts > 0) {
    return { error: `Cannot delete — ${prefix._count.contracts} contract(s) use this prefix` };
  }

  await prisma.contractPrefix.delete({ where: { id } });
  return { success: true };
}
