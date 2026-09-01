"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import type { RateRow } from "@/lib/equity-financials";

/**
 * Exchange rates for adding up figures across projects that don't report in the
 * same currency.
 *
 * Rates are typed in rather than fetched. A portfolio total gets opened months
 * after the figures were filed, and a live rate would make the same historical
 * total read differently every time — so what a total means would depend on when
 * you looked at it, which is not a property a financial figure may have.
 *
 * Editing is admin only: changing one rate silently moves every portfolio total
 * that converts through it. Reading takes either an admin or equity access —
 * admins need it to work the admin tab, and equity access needs it because every
 * cross-project total converts through these rows. A rate is not itself
 * sensitive; what it multiplies is.
 */

async function requireRateAdmin() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Unauthorized");
  return user;
}

export async function getCurrencyRates(): Promise<RateRow[]> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN" && !(await canAccessEquity(user.id))) {
    throw new Error("Unauthorized");
  }

  const rates = await prisma.currencyRate.findMany({
    // Base first — it's the one every other rate is quoted against, so it reads
    // as the heading of the list rather than a row lost in the middle of it.
    orderBy: [{ isBase: "desc" }, { code: "asc" }],
    select: { code: true, rate: true, isBase: true },
  });
  return rates;
}

/** ISO 4217 shape, upper-cased. Three letters is the whole of the format. */
function asCurrencyCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("A currency code is three letters, like KWD");
  return code;
}

/**
 * A rate has to be a positive number. Zero would make every figure in that
 * currency worth nothing, and a negative one would subtract a project from the
 * portfolio total — both of which would be believed rather than noticed.
 */
function asRate(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) throw new Error("A rate has to be greater than zero");
  return raw;
}

export async function saveCurrencyRate(code: string, rate: number) {
  await requireRateAdmin();
  const currency = asCurrencyCode(code);
  const value = asRate(rate);

  await prisma.currencyRate.upsert({
    where: { code: currency },
    create: { code: currency, rate: value },
    // isBase is deliberately not touched here, so editing a rate can't quietly
    // move which currency the totals are denominated in.
    update: { rate: value },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/equity");
}

/**
 * Moves the base currency, in one transaction.
 *
 * The base's own rate becomes 1 by definition, and the partial unique index on
 * isBase means the old base has to be cleared in the same breath as the new one
 * is set — two statements that could half-apply would leave the database with
 * two bases or none, and every total then unable to say what it was in.
 */
export async function setBaseCurrency(code: string) {
  await requireRateAdmin();
  const currency = asCurrencyCode(code);

  await prisma.$transaction(async (tx) => {
    const row = await tx.currencyRate.findUnique({ where: { code: currency } });
    if (!row) throw new Error("Add that currency's rate before making it the base");

    await tx.currencyRate.updateMany({ where: { isBase: true }, data: { isBase: false } });
    await tx.currencyRate.update({
      where: { code: currency },
      data: { isBase: true, rate: 1 },
    });
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/equity");
}

/**
 * Removes a currency. The base can't go: with no base, nothing says what a
 * portfolio total is denominated in, and every conversion would be reading an
 * unstated unit.
 */
export async function deleteCurrencyRate(code: string) {
  await requireRateAdmin();
  const currency = asCurrencyCode(code);

  const row = await prisma.currencyRate.findUnique({ where: { code: currency } });
  if (!row) return;
  if (row.isBase) throw new Error("Make another currency the base before removing this one");

  await prisma.currencyRate.delete({ where: { code: currency } });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/equity");
}
