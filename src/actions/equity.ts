"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessEquity } from "@/lib/equity-access";
import { computeContractEndDate, sumTrancheEquity } from "@/lib/equity-math";

async function requireEquityAccess() {
  const user = await requireUser();
  if (!canAccessEquity(user)) throw new Error("Unauthorized");
  return user;
}

const PORTFOLIO_INCLUDE = {
  project: { select: { id: true, name: true, logoUrl: true } },
  // Deal-level dilution schedule: tranches not tied to a specific grant.
  tranches: { where: { grantId: null }, orderBy: { order: "asc" as const } },
  contracts: { orderBy: { createdAt: "asc" as const } },
  grants: {
    orderBy: { createdAt: "asc" as const },
    include: { tranches: { orderBy: { order: "asc" as const } } },
  },
  // Newest first: the current valuation is the one people look for.
  valuations: { orderBy: { valuedAt: "desc" as const } },
};

function serialize(p: {
  id: string;
  projectId: string;
  confidence: string | null;
  moaStatus: string | null;
  equityStatus: string | null;
  vestingStartDate: Date | null;
  vestingEndDate: Date | null;
  vestingFrequency: string | null;
  totalEquityPct: number | null;
  dilutionDealType: string | null;
  valuationCurrency: string;
  latestCapTableDate: Date | null;
  notes: string | null;
  createdAt: Date;
  project: { id: string; name: string; logoUrl: string | null };
  tranches: { id: string; order: number; equityPct: number; startsAtValuation: number }[];
  contracts: {
    id: string;
    title: string | null;
    signed: boolean;
    startDate: Date | null;
    endDate: Date | null;
    lengthValue: number | null;
    lengthUnit: string | null;
    notes: string | null;
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    fileMimeType: string | null;
  }[];
  grants: {
    id: string;
    contractId: string | null;
    structureType: string;
    equityPct: number;
    dividendFrequency: string | null;
    notes: string | null;
    tranches: { id: string; order: number; equityPct: number; startsAtValuation: number }[];
  }[];
  valuations: {
    id: string;
    valuedAt: Date;
    amount: number;
    notes: string | null;
  }[];
}) {
  return {
    ...p,
    vestingStartDate: p.vestingStartDate?.toISOString() ?? null,
    vestingEndDate: p.vestingEndDate?.toISOString() ?? null,
    latestCapTableDate: p.latestCapTableDate?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    tranches: p.tranches.map((t) => ({
      id: t.id,
      order: t.order,
      equityPct: t.equityPct,
      startsAtValuation: t.startsAtValuation,
    })),
    contracts: p.contracts.map((c) => ({
      id: c.id,
      title: c.title,
      signed: c.signed,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
      lengthValue: c.lengthValue,
      lengthUnit: c.lengthUnit,
      notes: c.notes,
      fileUrl: c.fileUrl,
      fileName: c.fileName,
      fileSize: c.fileSize,
      fileMimeType: c.fileMimeType,
    })),
    grants: p.grants.map((g) => ({
      id: g.id,
      contractId: g.contractId,
      structureType: g.structureType,
      equityPct: g.equityPct,
      dividendFrequency: g.dividendFrequency,
      notes: g.notes,
      tranches: g.tranches.map((t) => ({
        id: t.id,
        order: t.order,
        equityPct: t.equityPct,
        startsAtValuation: t.startsAtValuation,
      })),
    })),
    valuations: p.valuations.map((v) => ({
      id: v.id,
      valuedAt: v.valuedAt.toISOString(),
      amount: v.amount,
      notes: v.notes,
    })),
  };
}

export type EquityPortfolioDTO = ReturnType<typeof serialize>;

export async function getEquityPortfolios() {
  await requireEquityAccess();
  const portfolios = await prisma.equityPortfolio.findMany({
    include: PORTFOLIO_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return portfolios.map(serialize);
}

export async function getEquityPortfolio(portfolioId: string) {
  await requireEquityAccess();
  const portfolio = await prisma.equityPortfolio.findUnique({
    where: { id: portfolioId },
    include: PORTFOLIO_INCLUDE,
  });
  return portfolio ? serialize(portfolio) : null;
}

/** Projects that don't have a portfolio yet — options for the create picker. */
export async function getEquityProjectOptions() {
  await requireEquityAccess();
  return prisma.project.findMany({
    where: { equityPortfolio: null },
    select: { id: true, name: true, logoUrl: true },
    orderBy: { name: "asc" },
  });
}

export async function createEquityPortfolio(projectId: string) {
  await requireEquityAccess();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");

  const existing = await prisma.equityPortfolio.findUnique({ where: { projectId } });
  if (existing) return { id: existing.id };

  const portfolio = await prisma.equityPortfolio.create({ data: { projectId } });
  revalidatePath("/dashboard/equity");
  return { id: portfolio.id };
}

export async function deleteEquityPortfolio(portfolioId: string) {
  await requireEquityAccess();
  await prisma.equityPortfolio.delete({ where: { id: portfolioId } });
  revalidatePath("/dashboard/equity");
}

// The end date is never supplied by the caller — it's always derived from the
// start date plus the contract length so the two can't drift apart.
type ContractInput = {
  title?: string | null;
  signed?: boolean;
  startDate?: string | null;
  lengthValue?: number | null;
  lengthUnit?: string | null;
  notes?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
};

export async function addEquityContract(portfolioId: string, data: ContractInput) {
  await requireEquityAccess();
  const startDate = data.startDate ? new Date(data.startDate) : null;
  const lengthValue = data.lengthValue ?? null;
  const lengthUnit = data.lengthUnit ?? "YEARS";
  const endDate = computeContractEndDate(startDate, lengthValue, lengthUnit);

  const contract = await prisma.equityContract.create({
    data: {
      portfolioId,
      title: data.title ?? null,
      signed: data.signed ?? false,
      notes: data.notes ?? null,
      fileUrl: data.fileUrl ?? null,
      fileName: data.fileName ?? null,
      fileSize: data.fileSize ?? null,
      fileMimeType: data.fileMimeType ?? null,
      startDate,
      lengthValue,
      lengthUnit,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
  return { id: contract.id };
}

export async function updateEquityContract(contractId: string, data: ContractInput) {
  await requireEquityAccess();
  const existing = await prisma.equityContract.findUnique({ where: { id: contractId } });
  if (!existing) throw new Error("Contract not found");

  // Merge with what's stored so a partial update still recomputes the end date
  // from the correct start/length pair.
  const startDate =
    data.startDate === undefined ? existing.startDate
    : data.startDate ? new Date(data.startDate) : null;
  const lengthValue = data.lengthValue === undefined ? existing.lengthValue : data.lengthValue;
  const lengthUnit = data.lengthUnit === undefined ? existing.lengthUnit : data.lengthUnit;
  const endDate = computeContractEndDate(startDate, lengthValue, lengthUnit);

  const contract = await prisma.equityContract.update({
    where: { id: contractId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.signed !== undefined && { signed: data.signed }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.fileUrl !== undefined && {
        fileUrl: data.fileUrl,
        fileName: data.fileName ?? null,
        fileSize: data.fileSize ?? null,
        fileMimeType: data.fileMimeType ?? null,
      }),
      startDate,
      lengthValue,
      lengthUnit,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${contract.portfolioId}`);
}

type TrancheInput = { equityPct: number; startsAtValuation: number };

type GrantInput = {
  contractId?: string | null;
  structureType?: string;
  equityPct?: number;
  dividendFrequency?: string | null;
  notes?: string | null;
  tranches?: TrancheInput[];
};

/**
 * Validates a tranche set and puts it in milestone order, so the schedule reads
 * cheapest-valuation-first no matter what order it was typed in.
 */
function normalizeTranches(tranches: TrancheInput[] | undefined): TrancheInput[] {
  if (!tranches) return [];
  for (const tranche of tranches) {
    if (tranche.equityPct == null || Number.isNaN(tranche.equityPct) || tranche.equityPct <= 0) {
      throw new Error("Every tranche needs an equity % above 0");
    }
    if (
      tranche.startsAtValuation == null ||
      Number.isNaN(tranche.startsAtValuation) ||
      tranche.startsAtValuation < 0
    ) {
      throw new Error("Every tranche needs a valuation to dilute at");
    }
  }
  return [...tranches].sort((a, b) => a.startsAtValuation - b.startsAtValuation);
}

/**
 * A tranched grant's total is owned by its tranches, so it starts at 0 and is
 * recomputed whenever they change. Fixed and dividend grants keep the entered %.
 */
async function syncTranchedGrantTotal(grantId: string) {
  const grant = await prisma.equityGrant.findUnique({
    where: { id: grantId },
    include: { tranches: { select: { equityPct: true } } },
  });
  if (!grant || grant.structureType !== "TRANCHED") return;
  await prisma.equityGrant.update({
    where: { id: grantId },
    data: { equityPct: sumTrancheEquity(grant.tranches) },
  });
}

export async function addEquityGrant(portfolioId: string, data: GrantInput) {
  await requireEquityAccess();
  const structureType = data.structureType || "FIXED";
  if (structureType !== "TRANCHED" && (data.equityPct == null || Number.isNaN(data.equityPct))) {
    throw new Error("Equity % is required");
  }
  const tranches = structureType === "TRANCHED" ? normalizeTranches(data.tranches) : [];

  const grant = await prisma.equityGrant.create({
    data: {
      portfolioId,
      contractId: data.contractId || null,
      structureType,
      // A tranched grant's total is owned by its tranches.
      equityPct: structureType === "TRANCHED" ? sumTrancheEquity(tranches) : data.equityPct!,
      dividendFrequency:
        structureType === "DIVIDEND" ? data.dividendFrequency || "QUARTERLY" : null,
      notes: data.notes || null,
      tranches: {
        create: tranches.map((tranche, i) => ({
          portfolioId,
          order: i + 1,
          equityPct: tranche.equityPct,
          startsAtValuation: tranche.startsAtValuation,
        })),
      },
    },
  });
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
  return { id: grant.id };
}

export async function updateEquityGrant(grantId: string, data: GrantInput) {
  await requireEquityAccess();
  const existing = await prisma.equityGrant.findUnique({ where: { id: grantId } });
  if (!existing) throw new Error("Equity entry not found");
  const structureType = data.structureType ?? existing.structureType;

  const grant = await prisma.equityGrant.update({
    where: { id: grantId },
    data: {
      ...(data.contractId !== undefined && { contractId: data.contractId || null }),
      ...(data.structureType !== undefined && { structureType }),
      ...(data.equityPct !== undefined && structureType !== "TRANCHED" && {
        equityPct: data.equityPct,
      }),
      dividendFrequency:
        structureType === "DIVIDEND"
          ? data.dividendFrequency || existing.dividendFrequency || "QUARTERLY"
          : null,
      ...(data.notes !== undefined && { notes: data.notes || null }),
    },
  });

  // The form submits the whole schedule, so it replaces what's stored rather
  // than merging — that's the only way a removed tranche can actually go away.
  if (structureType === "TRANCHED" && data.tranches !== undefined) {
    const tranches = normalizeTranches(data.tranches);
    await prisma.$transaction([
      prisma.equityTranche.deleteMany({ where: { grantId } }),
      ...tranches.map((tranche, i) =>
        prisma.equityTranche.create({
          data: {
            portfolioId: existing.portfolioId,
            grantId,
            order: i + 1,
            equityPct: tranche.equityPct,
            startsAtValuation: tranche.startsAtValuation,
          },
        }),
      ),
    ]);
  }
  // Switching to tranched hands the total over to the tranche rows.
  if (structureType === "TRANCHED") await syncTranchedGrantTotal(grantId);
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${grant.portfolioId}`);
}

export async function deleteEquityGrant(grantId: string) {
  await requireEquityAccess();
  const grant = await prisma.equityGrant.delete({ where: { id: grantId } });
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${grant.portfolioId}`);
}

export async function deleteEquityContract(contractId: string) {
  await requireEquityAccess();
  const contract = await prisma.equityContract.delete({ where: { id: contractId } });
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${contract.portfolioId}`);
}

/**
 * Tranches are numbered within their own set — a grant's tranches, or the
 * portfolio-wide ones — so both sequences read 1, 2, 3 …
 */
async function renumberTranches(portfolioId: string, grantId: string | null) {
  const remaining = await prisma.equityTranche.findMany({
    where: { portfolioId, grantId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  await Promise.all(
    remaining.map((t, i) =>
      t.order === i + 1
        ? Promise.resolve()
        : prisma.equityTranche.update({ where: { id: t.id }, data: { order: i + 1 } }),
    ),
  );
}

export async function addEquityTranche(
  portfolioId: string,
  data: { equityPct: number; startsAtValuation: number; grantId?: string | null },
) {
  await requireEquityAccess();
  const grantId = data.grantId || null;
  const count = await prisma.equityTranche.count({ where: { portfolioId, grantId } });
  await prisma.equityTranche.create({
    data: {
      portfolioId,
      grantId,
      order: count + 1,
      equityPct: data.equityPct,
      startsAtValuation: data.startsAtValuation,
    },
  });
  await reorderTranchesByValuation(portfolioId, grantId);
  if (grantId) await syncTranchedGrantTotal(grantId);
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

/** Keeps a schedule reading cheapest-milestone-first after an edit or insert. */
async function reorderTranchesByValuation(portfolioId: string, grantId: string | null) {
  const rows = await prisma.equityTranche.findMany({
    where: { portfolioId, grantId },
    orderBy: [{ startsAtValuation: "asc" }, { order: "asc" }],
    select: { id: true, order: true },
  });
  await Promise.all(
    rows.map((row, i) =>
      row.order === i + 1
        ? Promise.resolve()
        : prisma.equityTranche.update({ where: { id: row.id }, data: { order: i + 1 } }),
    ),
  );
}

export async function updateEquityTranche(
  trancheId: string,
  data: { equityPct?: number; startsAtValuation?: number },
) {
  await requireEquityAccess();
  if (data.equityPct != null && (Number.isNaN(data.equityPct) || data.equityPct <= 0)) {
    throw new Error("A tranche's equity % must be above 0");
  }
  if (
    data.startsAtValuation != null &&
    (Number.isNaN(data.startsAtValuation) || data.startsAtValuation < 0)
  ) {
    throw new Error("A tranche's valuation can't be negative");
  }

  const tranche = await prisma.equityTranche.update({ where: { id: trancheId }, data });
  await reorderTranchesByValuation(tranche.portfolioId, tranche.grantId);
  if (tranche.grantId) await syncTranchedGrantTotal(tranche.grantId);
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${tranche.portfolioId}`);
}

export async function deleteEquityTranche(trancheId: string) {
  await requireEquityAccess();
  const tranche = await prisma.equityTranche.delete({ where: { id: trancheId } });
  await renumberTranches(tranche.portfolioId, tranche.grantId);
  if (tranche.grantId) await syncTranchedGrantTotal(tranche.grantId);
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${tranche.portfolioId}`);
}

type ValuationInput = {
  valuedAt: string;
  amount: number;
  notes?: string | null;
};

function parseValuationInput(data: ValuationInput) {
  const valuedAt = new Date(data.valuedAt);
  if (!data.valuedAt || Number.isNaN(valuedAt.getTime())) {
    throw new Error("A valuation date is required");
  }
  if (data.amount == null || Number.isNaN(data.amount)) {
    throw new Error("A valuation amount is required");
  }
  if (data.amount < 0) throw new Error("Valuation can't be negative");
  return { valuedAt, amount: data.amount };
}

export async function addEquityValuation(portfolioId: string, data: ValuationInput) {
  await requireEquityAccess();
  const { valuedAt, amount } = parseValuationInput(data);

  const valuation = await prisma.equityValuation.create({
    data: { portfolioId, valuedAt, amount, notes: data.notes || null },
  });
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
  return { id: valuation.id };
}

export async function updateEquityValuation(valuationId: string, data: ValuationInput) {
  await requireEquityAccess();
  const existing = await prisma.equityValuation.findUnique({ where: { id: valuationId } });
  if (!existing) throw new Error("Valuation not found");
  const { valuedAt, amount } = parseValuationInput(data);

  await prisma.equityValuation.update({
    where: { id: valuationId },
    data: { valuedAt, amount, notes: data.notes || null },
  });
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${existing.portfolioId}`);
}

export async function deleteEquityValuation(valuationId: string) {
  await requireEquityAccess();
  const valuation = await prisma.equityValuation.delete({ where: { id: valuationId } });
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${valuation.portfolioId}`);
}
