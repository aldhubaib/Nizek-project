"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessEquity } from "@/lib/equity-access";
import {
  computeContractEndDate,
  EQUITY_FORMULA_OP,
  EQUITY_METRIC_TYPE,
  formatMetricValue,
  isDateMetric,
  isFieldAnswered,
  isFormulaMetric,
  isOngoing,
  sumTrancheEquity,
} from "@/lib/equity-math";
import { isCountryCode } from "@/lib/countries";
import { addToTrash } from "@/lib/trash";
import {
  logEquityChanges,
  logEquityEvent,
  type EquitySection,
} from "@/lib/equity-activity";
import {
  asText,
  day,
  diffSnapshots,
  diffSplitRows,
  money,
  pct,
  type EquityChange,
  type SplitRow,
  type Snapshot,
} from "@/lib/equity-diff";

async function requireEquityAccess() {
  const user = await requireUser();
  if (!(await canAccessEquity(user.id))) throw new Error("Unauthorized");
  return user;
}

/** A portfolio in the trash reads as gone everywhere except the trash itself. */
const LIVE = { deletedAt: null };

/**
 * The currency a portfolio's figures are quoted in, needed to write a valuation
 * into the history as the amount it was shown as.
 */
async function portfolioCurrency(portfolioId: string) {
  const portfolio = await prisma.equityPortfolio.findUnique({
    where: { id: portfolioId },
    select: { valuationCurrency: true },
  });
  return portfolio?.valuationCurrency ?? "KWD";
}

const PORTFOLIO_INCLUDE = {
  project: { select: { id: true, name: true, logoUrl: true, description: true } },
  // Deal-level dilution schedule: tranches not tied to a specific grant.
  tranches: { where: { grantId: null }, orderBy: { order: "asc" as const } },
  contracts: { orderBy: { createdAt: "asc" as const } },
  // Newest first: the latest split sets both our stake and the valuation.
  sets: {
    orderBy: { effectiveOn: "desc" as const },
    include: {
      grants: {
        orderBy: { order: "asc" as const },
        include: {
          tranches: { orderBy: { order: "asc" as const } },
          holder: { select: { id: true, name: true, isUs: true } },
          role: { select: { id: true, name: true } },
        },
      },
    },
  },
  // Newest period first, for the same reason; within one, the order the fields
  // are defined in.
  financialReports: {
    orderBy: { periodStart: "desc" as const },
    include: {
      values: {
        orderBy: { order: "asc" as const },
        include: {
          metric: { select: { id: true, name: true, type: true, unit: true } },
        },
      },
    },
  },
  // Which financial fields this project is asked for, in the order it asks for
  // them. The form is built from this rather than from the whole registry.
  reportFields: {
    orderBy: { order: "asc" as const },
    include: {
      metric: {
        select: {
          id: true,
          name: true,
          type: true,
          unit: true,
          formulaOp: true,
          leftId: true,
          rightId: true,
        },
      },
    },
  },
  // Newest reading first; within one, the order the metrics were entered in.
  performance: {
    orderBy: { recordedOn: "desc" as const },
    include: {
      values: {
        orderBy: { order: "asc" as const },
        include: {
          metric: { select: { id: true, name: true, type: true, unit: true } },
        },
      },
    },
  },
  opportunity: {
    include: {
      items: {
        orderBy: [{ section: "asc" as const }, { order: "asc" as const }],
        include: {
          holder: {
            select: {
              id: true,
              name: true,
              photoUrl: true,
              bio: true,
              linkedinUrl: true,
            },
          },
        },
      },
    },
  },
  // Shown in the order they were arranged in, not uploaded in.
  productPhotos: { orderBy: { order: "asc" as const } },
  // Widest tier first, as they were entered: the order they read in.
  marketTiers: { orderBy: { order: "asc" as const } },
  // Oldest first, so traction reads left to right and earliest to latest.
  milestones: {
    orderBy: [{ happenedOn: "asc" as const }, { order: "asc" as const }],
  },
  // Newest lineup first: the latest is the team, the rest is who it used to be.
  teamSnapshots: {
    orderBy: { effectiveOn: "desc" as const },
    include: {
      members: {
        orderBy: { order: "asc" as const },
        include: {
          holder: {
            select: {
              id: true,
              name: true,
              photoUrl: true,
              bio: true,
              linkedinUrl: true,
            },
          },
        },
      },
    },
  },
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
  liveDate: Date | null;
  notes: string | null;
  createdAt: Date;
  project: {
    id: string;
    name: string;
    logoUrl: string | null;
    description: string | null;
  };
  tranches: { id: string; order: number; equityPct: number; startsAtValuation: number }[];
  contracts: {
    id: string;
    title: string | null;
    signed: boolean;
    startDate: Date | null;
    endDate: Date | null;
    lengthValue: number | null;
    lengthUnit: string | null;
    monthlyFee: number | null;
    notes: string | null;
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    fileMimeType: string | null;
  }[];
  sets: {
    id: string;
    effectiveOn: Date;
    valuation: number | null;
    notes: string | null;
    grants: {
      id: string;
      contractId: string | null;
      holderId: string | null;
      roleId: string | null;
      holder: { id: string; name: string; isUs: boolean } | null;
      role: { id: string; name: string } | null;
      structureType: string;
      equityPct: number;
      dividendFrequency: string | null;
      notes: string | null;
      tranches: { id: string; order: number; equityPct: number; startsAtValuation: number }[];
    }[];
  }[];
  financialReports: {
    id: string;
    periodType: string;
    periodStart: Date;
    audited: boolean;
    needsHelp: boolean;
    helpNotes: string | null;
    values: {
      id: string;
      metricId: string;
      order: number;
      numberValue: number | null;
      dateValue: Date | null;
      metric: { id: string; name: string; type: string; unit: string | null };
    }[];
  }[];
  reportFields: {
    id: string;
    metricId: string;
    required: boolean;
    order: number;
    metric: {
      id: string;
      name: string;
      type: string;
      unit: string | null;
      formulaOp: string | null;
      leftId: string | null;
      rightId: string | null;
    };
  }[];
  performance: {
    id: string;
    recordedOn: Date;
    notes: string | null;
    values: {
      id: string;
      metricId: string;
      order: number;
      numberValue: number | null;
      dateValue: Date | null;
      metric: { id: string; name: string; type: string; unit: string | null };
    }[];
  }[];
  opportunity: {
    id: string;
    problem: string | null;
    solution: string | null;
    product: string | null;
    items: {
      id: string;
      section: string;
      order: number;
      heading: string | null;
      figure: string | null;
      caption: string | null;
      body: string | null;
      countries: string[];
      axisX: number | null;
      axisY: number | null;
      isUs: boolean;
      share: number | null;
      holderId: string | null;
      holder: {
        id: string;
        name: string;
        photoUrl: string | null;
        bio: string | null;
        linkedinUrl: string | null;
      } | null;
    }[];
  } | null;
  productPhotos: {
    id: string;
    url: string;
    caption: string | null;
    order: number;
  }[];
  marketTiers: {
    id: string;
    tier: string | null;
    amount: string | null;
    covers: string | null;
    meaning: string | null;
    order: number;
  }[];
  milestones: {
    id: string;
    happenedOn: Date;
    title: string;
    body: string | null;
    photoUrl: string | null;
    order: number;
  }[];
  teamSnapshots: {
    id: string;
    effectiveOn: Date;
    notes: string | null;
    members: {
      id: string;
      holderId: string;
      title: string | null;
      body: string | null;
      order: number;
      holder: {
        id: string;
        name: string;
        photoUrl: string | null;
        bio: string | null;
        linkedinUrl: string | null;
      };
    }[];
  }[];
}) {
  return {
    ...p,
    vestingStartDate: p.vestingStartDate?.toISOString() ?? null,
    vestingEndDate: p.vestingEndDate?.toISOString() ?? null,
    latestCapTableDate: p.latestCapTableDate?.toISOString() ?? null,
    liveDate: p.liveDate?.toISOString() ?? null,
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
      monthlyFee: c.monthlyFee,
      notes: c.notes,
      fileUrl: c.fileUrl,
      fileName: c.fileName,
      fileSize: c.fileSize,
      fileMimeType: c.fileMimeType,
    })),
    sets: p.sets.map((s) => ({
      id: s.id,
      effectiveOn: s.effectiveOn.toISOString(),
      valuation: s.valuation,
      notes: s.notes,
      grants: s.grants.map((g) => ({
        id: g.id,
        contractId: g.contractId,
        holderId: g.holderId,
        roleId: g.roleId,
        holder: g.holder,
        role: g.role,
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
    })),
    financialReports: p.financialReports.map((r) => ({
      id: r.id,
      periodType: r.periodType,
      periodStart: r.periodStart.toISOString(),
      audited: r.audited,
      needsHelp: r.needsHelp,
      helpNotes: r.helpNotes,
      values: r.values.map((v) => ({
        id: v.id,
        metricId: v.metricId,
        order: v.order,
        numberValue: v.numberValue,
        dateValue: v.dateValue?.toISOString() ?? null,
        metric: v.metric,
      })),
    })),
    reportFields: p.reportFields.map((f) => ({
      id: f.id,
      metricId: f.metricId,
      required: f.required,
      order: f.order,
      metric: f.metric,
    })),
    performance: p.performance.map((entry) => ({
      id: entry.id,
      recordedOn: entry.recordedOn.toISOString(),
      notes: entry.notes,
      values: entry.values.map((v) => ({
        id: v.id,
        metricId: v.metricId,
        order: v.order,
        numberValue: v.numberValue,
        dateValue: v.dateValue?.toISOString() ?? null,
        metric: v.metric,
      })),
    })),
    opportunity: p.opportunity,
    productPhotos: p.productPhotos,
    marketTiers: p.marketTiers,
    milestones: p.milestones.map((m) => ({
      ...m,
      happenedOn: m.happenedOn.toISOString(),
    })),
    teamSnapshots: p.teamSnapshots.map((s) => ({
      id: s.id,
      effectiveOn: s.effectiveOn.toISOString(),
      notes: s.notes,
      members: s.members,
    })),
  };
}

export type EquityPortfolioDTO = ReturnType<typeof serialize>;

export async function getEquityPortfolios() {
  await requireEquityAccess();
  const portfolios = await prisma.equityPortfolio.findMany({
    where: LIVE,
    include: PORTFOLIO_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return portfolios.map(serialize);
}

export async function getEquityPortfolio(portfolioId: string) {
  await requireEquityAccess();
  const portfolio = await prisma.equityPortfolio.findFirst({
    where: { id: portfolioId, ...LIVE },
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
  const user = await requireEquityAccess();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");

  const existing = await prisma.equityPortfolio.findUnique({ where: { projectId } });
  if (existing) {
    // A project can only ever have one portfolio, so "add equity" to a project
    // whose portfolio is in the trash means taking that one back out — the
    // alternative is a unique-constraint error nobody can act on.
    if (existing.deletedAt) {
      await prisma.equityPortfolio.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });
      await prisma.trashItem.deleteMany({
        where: { entityType: "EQUITY_PORTFOLIO", entityId: existing.id },
      });
      await logEquityEvent({
        portfolioId: existing.id,
        userId: user.id,
        section: "PORTFOLIO",
        action: "restored",
        label: "Portfolio",
        newValue: "Restored from the trash",
      });
      revalidatePath("/dashboard/trash");
      revalidatePath("/dashboard/equity");
    }
    return { id: existing.id };
  }

  const portfolio = await prisma.equityPortfolio.create({ data: { projectId } });
  await logEquityEvent({
    portfolioId: portfolio.id,
    userId: user.id,
    section: "PORTFOLIO",
    action: "created",
    label: "Portfolio",
    newValue: "Created",
  });
  revalidatePath("/dashboard/equity");
  return { id: portfolio.id };
}

/**
 * Moves a portfolio to the trash. Nothing is actually removed — the row is
 * flagged and listed in the trash, where it can be restored or, by an admin,
 * finally deleted.
 *
 * The project's name has to be typed back to get this far. The check is
 * repeated here rather than trusted from the dialog, because a portfolio is
 * years of contracts, splits and financials behind one button.
 */
export async function deleteEquityPortfolio(
  portfolioId: string,
  confirmName: string,
) {
  const user = await requireEquityAccess();
  const portfolio = await prisma.equityPortfolio.findFirst({
    where: { id: portfolioId, ...LIVE },
    select: { id: true, project: { select: { name: true } } },
  });
  if (!portfolio) throw new Error("Portfolio not found");

  if (confirmName.trim() !== portfolio.project.name) {
    throw new Error(`Type "${portfolio.project.name}" exactly to delete it`);
  }

  await prisma.equityPortfolio.update({
    where: { id: portfolioId },
    data: { deletedAt: new Date() },
  });
  await addToTrash({
    entityType: "EQUITY_PORTFOLIO",
    entityId: portfolioId,
    label: portfolio.project.name,
    sublabel: "Contracts, splits, financials and the pitch",
    deletedById: user.id,
  });
  await logEquityEvent({
    portfolioId,
    userId: user.id,
    section: "PORTFOLIO",
    action: "deleted",
    label: "Portfolio",
    newValue: "Moved to the trash",
  });

  revalidatePath("/dashboard/equity");
  revalidatePath("/dashboard/trash");
}

/** The change history for one portfolio, newest first. */
export type EquityActivityDTO = {
  id: string;
  section: string;
  action: string;
  subject: string | null;
  label: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string; imageUrl: string | null };
};

export async function getEquityActivity(
  portfolioId: string,
): Promise<EquityActivityDTO[]> {
  await requireEquityAccess();
  const rows = await prisma.equityActivity.findMany({
    where: { portfolioId },
    orderBy: { createdAt: "desc" },
    // A portfolio edited every week for years still opens instantly; older
    // entries are history nobody scrolls to.
    take: 500,
    include: {
      user: { select: { id: true, name: true, email: true, imageUrl: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    section: row.section,
    action: row.action,
    subject: row.subject,
    label: row.label,
    oldValue: row.oldValue,
    newValue: row.newValue,
    createdAt: row.createdAt.toISOString(),
    user: row.user,
  }));
}

/**
 * Writes the shared Project.description — the same column the create-project
 * dialog and project settings write, so an edit from either side shows up on
 * the other.
 *
 * Gated on equity access rather than the ADMIN/PROJECT_MANAGER role that
 * updateProject requires: equity permissions are granted independently of
 * project membership, so reusing that action here would reject the very people
 * this page exists for.
 */
export async function updateEquityProjectDescription(
  portfolioId: string,
  description: string
) {
  const user = await requireEquityAccess();
  const portfolio = await prisma.equityPortfolio.findUnique({
    where: { id: portfolioId },
    select: { projectId: true },
  });
  if (!portfolio) throw new Error("Portfolio not found");

  const trimmed = description.trim();
  const before = await prisma.project.findUnique({
    where: { id: portfolio.projectId },
    select: { description: true },
  });
  await prisma.project.update({
    where: { id: portfolio.projectId },
    data: { description: trimmed || null },
  });
  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "OPPORTUNITY",
    action: "updated",
    changes: diffSnapshots(
      { Description: before?.description ?? null },
      { Description: trimmed || null },
    ),
  });

  revalidatePath(`/dashboard/equity/${portfolioId}`);
  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/projects/${portfolio.projectId}`);
  revalidatePath("/dashboard/projects");
}

/**
 * The launch date, or null to clear it. Whether the product counts as live is
 * derived from this date wherever it's shown, so there's nothing else to keep
 * in step.
 */
export async function updateEquityLiveDate(
  portfolioId: string,
  liveDate: string | null
) {
  const user = await requireEquityAccess();

  let parsed: Date | null = null;
  if (liveDate) {
    parsed = new Date(liveDate);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid launch date");
  }

  const before = await prisma.equityPortfolio.findUnique({
    where: { id: portfolioId },
    select: { liveDate: true },
  });
  await prisma.equityPortfolio.update({
    where: { id: portfolioId },
    data: { liveDate: parsed },
  });
  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "OPPORTUNITY",
    action: "updated",
    changes: diffSnapshots(
      { "Launch date": day(before?.liveDate ?? null) },
      { "Launch date": day(parsed) },
    ),
  });

  revalidatePath(`/dashboard/equity/${portfolioId}`);
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
  monthlyFee?: number | null;
  notes?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
};

/** A contract as its fields read on the card, for the history. */
function contractSnapshot(
  contract: {
    title: string | null;
    signed: boolean;
    startDate: Date | null;
    endDate: Date | null;
    lengthValue: number | null;
    lengthUnit: string | null;
    monthlyFee: number | null;
    notes: string | null;
    fileName: string | null;
  },
  currency: string,
): Snapshot {
  return {
    Title: contract.title,
    Signed: asText(contract.signed),
    "Start date": day(contract.startDate),
    Length: isOngoing(contract.lengthUnit)
      ? "Ongoing"
      : contract.lengthValue != null
        ? `${contract.lengthValue} ${(contract.lengthUnit ?? "").toLowerCase()}`
        : null,
    "End date": day(contract.endDate),
    "Monthly fee": money(contract.monthlyFee, currency),
    Notes: contract.notes,
    File: contract.fileName,
  };
}

function contractName(title: string | null) {
  return title?.trim() || "Untitled contract";
}

export async function addEquityContract(portfolioId: string, data: ContractInput) {
  const user = await requireEquityAccess();
  const startDate = data.startDate ? new Date(data.startDate) : null;
  const lengthUnit = data.lengthUnit ?? "YEARS";
  // An ongoing engagement has no term and never hands the tech over, so a
  // length or a fee left behind by an earlier choice would only contradict it.
  const ongoing = isOngoing(lengthUnit);
  const lengthValue = ongoing ? null : (data.lengthValue ?? null);
  const endDate = computeContractEndDate(startDate, lengthValue, lengthUnit);

  const contract = await prisma.equityContract.create({
    data: {
      portfolioId,
      title: data.title ?? null,
      signed: data.signed ?? false,
      monthlyFee: ongoing ? null : (data.monthlyFee ?? null),
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

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "CONTRACTS",
    action: "created",
    subject: contractName(contract.title),
    changes: diffSnapshots(
      null,
      contractSnapshot(contract, await portfolioCurrency(portfolioId)),
    ),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
  return { id: contract.id };
}

export async function updateEquityContract(contractId: string, data: ContractInput) {
  const user = await requireEquityAccess();
  const existing = await prisma.equityContract.findUnique({ where: { id: contractId } });
  if (!existing) throw new Error("Contract not found");

  // Merge with what's stored so a partial update still recomputes the end date
  // from the correct start/length pair.
  const startDate =
    data.startDate === undefined ? existing.startDate
    : data.startDate ? new Date(data.startDate) : null;
  const lengthUnit = data.lengthUnit === undefined ? existing.lengthUnit : data.lengthUnit;
  const ongoing = isOngoing(lengthUnit);
  // Switching an existing contract to ongoing has to clear the term and the fee
  // too, or the old figures would linger behind a status that denies them.
  const lengthValue =
    ongoing ? null
    : data.lengthValue === undefined ? existing.lengthValue
    : data.lengthValue;
  const endDate = computeContractEndDate(startDate, lengthValue, lengthUnit);

  const contract = await prisma.equityContract.update({
    where: { id: contractId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.signed !== undefined && { signed: data.signed }),
      ...(ongoing ?
        { monthlyFee: null }
      : data.monthlyFee !== undefined && { monthlyFee: data.monthlyFee }),
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

  const currency = await portfolioCurrency(contract.portfolioId);
  await logEquityChanges({
    portfolioId: contract.portfolioId,
    userId: user.id,
    section: "CONTRACTS",
    action: "updated",
    subject: contractName(contract.title),
    changes: diffSnapshots(
      contractSnapshot(existing, currency),
      contractSnapshot(contract, currency),
    ),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${contract.portfolioId}`);
}

type TrancheInput = { equityPct: number; startsAtValuation: number };

type GrantInput = {
  contractId?: string | null;
  holderId?: string | null;
  roleId?: string | null;
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

export type EquitySetInput = {
  /** The day the split takes effect, which is what orders the history. */
  effectiveOn: string;
  valuation: number | null;
  entries: GrantInput[];
};

/**
 * Checked before anything is written, so one bad row rejects the whole split
 * rather than leaving half of it saved.
 */
function prepareGrants(entries: GrantInput[]) {
  return entries.map((data) => {
    const structureType = data.structureType || "FIXED";
    if (structureType !== "TRANCHED" && (data.equityPct == null || Number.isNaN(data.equityPct))) {
      throw new Error("Equity % is required");
    }
    return {
      data,
      structureType,
      tranches: structureType === "TRANCHED" ? normalizeTranches(data.tranches) : [],
    };
  });
}

function grantData(
  portfolioId: string,
  { data, structureType, tranches }: ReturnType<typeof prepareGrants>[number],
  index: number,
) {
  return {
    portfolioId,
    // The order they were arranged in, which is the order they read back in.
    order: index + 1,
    contractId: data.contractId || null,
    holderId: data.holderId || null,
    roleId: data.roleId || null,
    structureType,
    // A tranched row's total is owned by its tranches.
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
  };
}

function parseEffectiveOn(raw: string): Date {
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) throw new Error("Invalid date for this equity split");
  return when;
}

/** Writes what diffSplitRows worked out, one history entry at a time. */
async function logSplitRows(entry: {
  portfolioId: string;
  userId: string;
  subject: string;
  before: SplitRow[];
  after: SplitRow[];
  currency: string;
}) {
  const { portfolioId, userId, subject } = entry;
  for (const change of diffSplitRows(entry.before, entry.after, entry.currency)) {
    if (change.action === "updated") {
      await logEquityChanges({
        portfolioId,
        userId,
        section: "EQUITY",
        action: "updated",
        subject,
        changes: change.changes,
      });
      continue;
    }
    await logEquityEvent({
      portfolioId,
      userId,
      section: "EQUITY",
      action: change.action,
      subject,
      label: change.label,
      ...(change.action === "created"
        ? { newValue: change.value }
        : { oldValue: change.value }),
    });
  }
}

const SPLIT_ROWS_INCLUDE = {
  holder: { select: { name: true } },
  role: { select: { name: true } },
  tranches: { select: { startsAtValuation: true }, orderBy: { order: "asc" as const } },
};

function splitLabel(effectiveOn: Date) {
  return `Split of ${day(effectiveOn)}`;
}

/**
 * Records a new dated split, leaving the ones before it untouched. This is how
 * dilution gets recorded: a later split restates the whole cap table, and the
 * difference from the first one is what we gave up.
 */
export async function addEquitySet(portfolioId: string, input: EquitySetInput) {
  const user = await requireEquityAccess();
  const prepared = prepareGrants(input.entries);
  const effectiveOn = parseEffectiveOn(input.effectiveOn);

  // Nested so the split and its rows land together — a set with no rows would
  // read as a company nobody owns.
  const set = await prisma.equitySet.create({
    data: {
      portfolioId,
      effectiveOn,
      valuation: input.valuation,
      grants: { create: prepared.map((p, i) => grantData(portfolioId, p, i)) },
    },
    include: { grants: { include: SPLIT_ROWS_INCLUDE, orderBy: { order: "asc" } } },
  });

  const currency = await portfolioCurrency(portfolioId);
  const subject = splitLabel(effectiveOn);
  await logEquityEvent({
    portfolioId,
    userId: user.id,
    section: "EQUITY",
    action: "created",
    subject,
    label: "Split",
    newValue: `${set.grants.length} ${set.grants.length === 1 ? "row" : "rows"}${
      input.valuation != null ? ` · valued at ${money(input.valuation, currency)}` : ""
    }`,
  });
  await logSplitRows({
    portfolioId,
    userId: user.id,
    subject,
    before: [],
    after: set.grants,
    currency,
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
  return { id: set.id };
}

/**
 * Rewrites one dated split. The form edits every row together, so it submits
 * the finished picture rather than a diff — anything absent from it has been
 * taken out. One transaction, because a half-written split leaves the project
 * adding up to a number nobody agreed to.
 */
export async function updateEquitySet(setId: string, input: EquitySetInput) {
  const user = await requireEquityAccess();
  const existing = await prisma.equitySet.findUnique({
    where: { id: setId },
    select: {
      portfolioId: true,
      effectiveOn: true,
      valuation: true,
      grants: { include: SPLIT_ROWS_INCLUDE, orderBy: { order: "asc" } },
    },
  });
  if (!existing) throw new Error("Equity split not found");

  const prepared = prepareGrants(input.entries);
  const effectiveOn = parseEffectiveOn(input.effectiveOn);
  const { portfolioId } = existing;

  await prisma.$transaction([
    prisma.equitySet.update({
      where: { id: setId },
      data: { effectiveOn, valuation: input.valuation },
    }),
    // Their tranches go with them — the relation cascades.
    prisma.equityGrant.deleteMany({ where: { setId } }),
    ...prepared.map((p, i) =>
      prisma.equityGrant.create({ data: { setId, ...grantData(portfolioId, p, i) } }),
    ),
  ]);

  const currency = await portfolioCurrency(portfolioId);
  const subject = splitLabel(effectiveOn);
  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "EQUITY",
    action: "updated",
    subject,
    changes: diffSnapshots(
      {
        "Effective date": day(existing.effectiveOn),
        Valuation: money(existing.valuation, currency),
      },
      {
        "Effective date": day(effectiveOn),
        Valuation: money(input.valuation, currency),
      },
    ),
  });

  const after = await prisma.equityGrant.findMany({
    where: { setId },
    include: SPLIT_ROWS_INCLUDE,
    orderBy: { order: "asc" },
  });
  await logSplitRows({
    portfolioId,
    userId: user.id,
    subject,
    before: existing.grants,
    after,
    currency,
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

export async function deleteEquitySet(setId: string) {
  const user = await requireEquityAccess();
  // Counted before it goes, since the rows leave with it.
  const rows = await prisma.equityGrant.count({ where: { setId } });
  const set = await prisma.equitySet.delete({ where: { id: setId } });

  await logEquityEvent({
    portfolioId: set.portfolioId,
    userId: user.id,
    section: "EQUITY",
    action: "deleted",
    subject: splitLabel(set.effectiveOn),
    label: "Split",
    oldValue: `${rows} ${rows === 1 ? "row" : "rows"}`,
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${set.portfolioId}`);
}

export async function deleteEquityContract(contractId: string) {
  const user = await requireEquityAccess();
  const contract = await prisma.equityContract.delete({ where: { id: contractId } });

  await logEquityEvent({
    portfolioId: contract.portfolioId,
    userId: user.id,
    section: "CONTRACTS",
    action: "deleted",
    subject: contractName(contract.title),
    label: "Contract",
    oldValue: contractName(contract.title),
  });

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
  const user = await requireEquityAccess();
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

  await logEquityEvent({
    portfolioId,
    userId: user.id,
    section: "TRANCHES",
    action: "created",
    label: "Tranche",
    newValue: `${pct(data.equityPct)} from ${money(
      data.startsAtValuation,
      await portfolioCurrency(portfolioId),
    )}`,
  });

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
  const user = await requireEquityAccess();
  if (data.equityPct != null && (Number.isNaN(data.equityPct) || data.equityPct <= 0)) {
    throw new Error("A tranche's equity % must be above 0");
  }
  if (
    data.startsAtValuation != null &&
    (Number.isNaN(data.startsAtValuation) || data.startsAtValuation < 0)
  ) {
    throw new Error("A tranche's valuation can't be negative");
  }

  const before = await prisma.equityTranche.findUnique({ where: { id: trancheId } });
  const tranche = await prisma.equityTranche.update({ where: { id: trancheId }, data });
  await reorderTranchesByValuation(tranche.portfolioId, tranche.grantId);
  if (tranche.grantId) await syncTranchedGrantTotal(tranche.grantId);

  const currency = await portfolioCurrency(tranche.portfolioId);
  await logEquityChanges({
    portfolioId: tranche.portfolioId,
    userId: user.id,
    section: "TRANCHES",
    action: "updated",
    subject: `Tranche ${tranche.order}`,
    changes: diffSnapshots(
      before && {
        "Equity %": pct(before.equityPct),
        "Dilutes at": money(before.startsAtValuation, currency),
      },
      {
        "Equity %": pct(tranche.equityPct),
        "Dilutes at": money(tranche.startsAtValuation, currency),
      },
    ),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${tranche.portfolioId}`);
}

export async function deleteEquityTranche(trancheId: string) {
  const user = await requireEquityAccess();
  const tranche = await prisma.equityTranche.delete({ where: { id: trancheId } });
  await renumberTranches(tranche.portfolioId, tranche.grantId);
  if (tranche.grantId) await syncTranchedGrantTotal(tranche.grantId);

  await logEquityEvent({
    portfolioId: tranche.portfolioId,
    userId: user.id,
    section: "TRANCHES",
    action: "deleted",
    label: "Tranche",
    oldValue: `${pct(tranche.equityPct)} from ${money(
      tranche.startsAtValuation,
      await portfolioCurrency(tranche.portfolioId),
    )}`,
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${tranche.portfolioId}`);
}

// ─── Equity holders ──────────────────────────────────
// One shared registry of names across every portfolio, so a fund that appears
// on two cap tables is the same row on both.

export type EquityHolderDTO = {
  id: string;
  name: string;
  isUs: boolean;
  kind: string | null;
  photoUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  /** Rows held under this name — a name in use can't be deleted. */
  grantCount: number;
};

export async function listEquityHolders(): Promise<EquityHolderDTO[]> {
  await requireEquityAccess();
  const holders = await prisma.equityHolder.findMany({
    orderBy: [{ isUs: "desc" }, { name: "asc" }],
    include: { _count: { select: { grants: true } } },
  });
  return holders.map((h) => ({
    id: h.id,
    name: h.name,
    isUs: h.isUs,
    kind: h.kind,
    photoUrl: h.photoUrl,
    bio: h.bio,
    linkedinUrl: h.linkedinUrl,
    grantCount: h._count.grants,
  }));
}

type HolderInput = {
  name: string;
  kind?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  linkedinUrl?: string | null;
};

/**
 * Only what the caller sent. A form that edits the name alone shouldn't clear
 * the profile beside it, so an absent key means "leave it" and an empty one
 * means "clear it".
 */
function holderProfileData(data: HolderInput) {
  const patch: {
    kind?: string | null;
    photoUrl?: string | null;
    bio?: string | null;
    linkedinUrl?: string | null;
  } = {};
  if (data.kind !== undefined) patch.kind = data.kind || null;
  if (data.photoUrl !== undefined) patch.photoUrl = data.photoUrl?.trim() || null;
  if (data.bio !== undefined) patch.bio = data.bio?.trim() || null;
  if (data.linkedinUrl !== undefined) {
    patch.linkedinUrl = data.linkedinUrl?.trim() || null;
  }
  return patch;
}

/** Prisma's unique violation, surfaced as something the form can show. */
function asDuplicateNameError(err: unknown, name: string): Error | null {
  const code = (err as { code?: string })?.code;
  return code === "P2002" ? new Error(`"${name}" is already in the list`) : null;
}

export async function addEquityHolder(data: HolderInput) {
  await requireEquityAccess();
  const name = data.name.trim();
  if (!name) throw new Error("A name is required");

  try {
    const holder = await prisma.equityHolder.create({
      data: { name, ...holderProfileData(data) },
    });
    revalidatePath("/dashboard/equity");
    return { id: holder.id };
  } catch (err) {
    throw asDuplicateNameError(err, name) ?? err;
  }
}

export async function updateEquityHolder(holderId: string, data: HolderInput) {
  await requireEquityAccess();
  const name = data.name.trim();
  if (!name) throw new Error("A name is required");

  try {
    await prisma.equityHolder.update({
      where: { id: holderId },
      data: { name, ...holderProfileData(data) },
    });
  } catch (err) {
    throw asDuplicateNameError(err, name) ?? err;
  }
  revalidatePath("/dashboard/equity");
}

export async function deleteEquityHolder(holderId: string) {
  await requireEquityAccess();
  const holder = await prisma.equityHolder.findUnique({
    where: { id: holderId },
    include: { _count: { select: { grants: true, teamMembers: true } } },
  });
  if (!holder) throw new Error("Holder not found");
  if (holder.isUs) throw new Error("This is us — it can't be removed");
  // The database restricts both of these too; catching them here says why
  // rather than surfacing a foreign-key error.
  if (holder._count.grants > 0) {
    throw new Error(
      `${holder.name} holds ${holder._count.grants} equity ${holder._count.grants === 1 ? "entry" : "entries"} and can't be deleted`,
    );
  }
  if (holder._count.teamMembers > 0) {
    throw new Error(
      `${holder.name} is on ${holder._count.teamMembers} ${holder._count.teamMembers === 1 ? "team" : "teams"} and can't be deleted`,
    );
  }

  await prisma.equityHolder.delete({ where: { id: holderId } });
  revalidatePath("/dashboard/equity");
}

// ─── Roles ──────────────────────────────────────────────

export type EquityRoleDTO = {
  id: string;
  name: string;
  notes: string | null;
  /** Equity entries using this role — one in use can't be deleted. */
  grantCount: number;
};

export async function listEquityRoles(): Promise<EquityRoleDTO[]> {
  await requireEquityAccess();
  const roles = await prisma.equityRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { grants: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    grantCount: r._count.grants,
  }));
}

type RoleInput = { name: string; notes?: string | null };

export async function addEquityRole(data: RoleInput) {
  await requireEquityAccess();
  const name = data.name.trim();
  if (!name) throw new Error("A role name is required");

  try {
    const role = await prisma.equityRole.create({
      data: { name, notes: data.notes?.trim() || null },
    });
    revalidatePath("/dashboard/equity");
    return { id: role.id };
  } catch (err) {
    throw asDuplicateNameError(err, name) ?? err;
  }
}

export async function updateEquityRole(roleId: string, data: RoleInput) {
  await requireEquityAccess();
  const name = data.name.trim();
  if (!name) throw new Error("A role name is required");

  try {
    await prisma.equityRole.update({
      where: { id: roleId },
      data: { name, notes: data.notes?.trim() || null },
    });
  } catch (err) {
    throw asDuplicateNameError(err, name) ?? err;
  }
  revalidatePath("/dashboard/equity");
}

export async function deleteEquityRole(roleId: string) {
  await requireEquityAccess();
  const role = await prisma.equityRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { grants: true } } },
  });
  if (!role) throw new Error("Role not found");
  if (role._count.grants > 0) {
    throw new Error(
      `${role.name} is used by ${role._count.grants} equity ${role._count.grants === 1 ? "entry" : "entries"} and can't be deleted`,
    );
  }

  await prisma.equityRole.delete({ where: { id: roleId } });
  revalidatePath("/dashboard/equity");
}

// ─── Metrics ────────────────────────────────────────────

export type EquityMetricDTO = {
  id: string;
  name: string;
  /** PERFORMANCE | FINANCIAL — which module offers the field. */
  group: string;
  type: string;
  unit: string | null;
  order: number;
  /** Set together, and only on a calculated field. */
  formulaOp: string | null;
  leftId: string | null;
  rightId: string | null;
  /** Values recorded against it — a field in use can't be deleted or retyped. */
  valueCount: number;
};

const METRIC_COUNTS = {
  _count: { select: { values: true, financialValues: true } },
} as const;

/** Both modules record against the same registry, so both count as use. */
function usageOf(metric: {
  _count: { values: number; financialValues: number };
}) {
  return metric._count.values + metric._count.financialValues;
}

export async function listEquityMetrics(): Promise<EquityMetricDTO[]> {
  await requireEquityAccess();
  const metrics = await prisma.equityMetric.findMany({
    orderBy: [{ group: "asc" }, { order: "asc" }, { name: "asc" }],
    include: METRIC_COUNTS,
  });
  return metrics.map((m) => ({
    id: m.id,
    name: m.name,
    group: m.group,
    type: m.type,
    unit: m.unit,
    order: m.order,
    formulaOp: m.formulaOp,
    leftId: m.leftId,
    rightId: m.rightId,
    valueCount: usageOf(m),
  }));
}

type MetricInput = {
  name: string;
  group?: string;
  type: string;
  unit?: string | null;
  formulaOp?: string | null;
  leftId?: string | null;
  rightId?: string | null;
};

function metricType(type: string) {
  return type in EQUITY_METRIC_TYPE ? type : "NUMBER";
}

function metricGroup(group: string | undefined) {
  return group === "FINANCIAL" ? "FINANCIAL" : "PERFORMANCE";
}

/**
 * The two operands of a calculated field, checked before they're stored.
 *
 * Both have to exist, sit in the same group as the field itself, and be plain
 * figures: a formula over a formula would need an evaluation order to be
 * defined and a cycle to be guarded against, which is a lot of machinery for a
 * field that could just as easily be written out in full. A field that isn't
 * calculated has its operands cleared, so nothing stale is left pointing.
 */
async function resolveFormula(data: MetricInput, group: string) {
  if (metricType(data.type) !== "FORMULA") {
    return { formulaOp: null, leftId: null, rightId: null };
  }

  const op = data.formulaOp;
  if (!op || !(op in EQUITY_FORMULA_OP)) {
    throw new Error("Pick what the calculation does");
  }
  if (!data.leftId || !data.rightId) {
    throw new Error("A calculated field needs two fields to work from");
  }

  const operands = await prisma.equityMetric.findMany({
    where: { id: { in: [data.leftId, data.rightId] } },
    select: { id: true, name: true, group: true, type: true },
  });
  for (const id of [data.leftId, data.rightId]) {
    const operand = operands.find((o) => o.id === id);
    if (!operand) throw new Error("That field no longer exists");
    if (operand.group !== group) {
      throw new Error(
        `${operand.name} is in a different group — a calculation can only use fields beside it`,
      );
    }
    if (isFormulaMetric(operand.type)) {
      throw new Error(
        `${operand.name} is itself calculated, so it can't be used in another calculation`,
      );
    }
    if (isDateMetric(operand.type)) {
      throw new Error(`${operand.name} is a date, so there's nothing to work out with it`);
    }
  }

  return { formulaOp: op, leftId: data.leftId, rightId: data.rightId };
}

export async function addEquityMetric(data: MetricInput) {
  await requireEquityAccess();
  const name = data.name.trim();
  if (!name) throw new Error("A name is required");

  const group = metricGroup(data.group);
  const formula = await resolveFormula(data, group);
  // Appended to its own group, so a new field lands at the end of the form
  // rather than in the middle of one already being filled in.
  const last = await prisma.equityMetric.findFirst({
    where: { group },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  try {
    const metric = await prisma.equityMetric.create({
      data: {
        name,
        group,
        type: metricType(data.type),
        unit: data.unit?.trim() || null,
        order: (last?.order ?? 0) + 1,
        ...formula,
      },
    });
    revalidatePath("/dashboard/equity");
    return { id: metric.id };
  } catch (err) {
    throw asDuplicateNameError(err, name) ?? err;
  }
}

export async function updateEquityMetric(metricId: string, data: MetricInput) {
  await requireEquityAccess();
  const name = data.name.trim();
  if (!name) throw new Error("A name is required");

  const existing = await prisma.equityMetric.findUnique({
    where: { id: metricId },
    include: METRIC_COUNTS,
  });
  if (!existing) throw new Error("Metric not found");

  const used = usageOf(existing);
  const type = metricType(data.type);
  const group = metricGroup(data.group ?? existing.group);

  // A figure, a date and a calculation are held in different places — two
  // columns and nowhere at all — so changing between them would leave every
  // value recorded so far pointing at an empty one. Renaming and re-labelling
  // stay open; those don't touch what was recorded.
  if (
    used > 0 &&
    (isDateMetric(type) !== isDateMetric(existing.type) ||
      isFormulaMetric(type) !== isFormulaMetric(existing.type))
  ) {
    throw new Error(
      `${existing.name} already has ${used} value${used === 1 ? "" : "s"} recorded, so its type can't change`,
    );
  }
  if (used > 0 && group !== existing.group) {
    throw new Error(
      `${existing.name} already has ${used} value${
        used === 1 ? "" : "s"
      } recorded, so it can't move to another group`,
    );
  }
  // A field can't be an operand of the calculation it feeds, or of itself.
  if (data.leftId === metricId || data.rightId === metricId) {
    throw new Error("A calculation can't use itself");
  }

  const formula = await resolveFormula({ ...data, type }, group);

  try {
    await prisma.equityMetric.update({
      where: { id: metricId },
      data: { name, group, type, unit: data.unit?.trim() || null, ...formula },
    });
  } catch (err) {
    throw asDuplicateNameError(err, name) ?? err;
  }
  revalidatePath("/dashboard/equity");
}

export async function deleteEquityMetric(metricId: string) {
  await requireEquityAccess();
  const metric = await prisma.equityMetric.findUnique({
    where: { id: metricId },
    include: {
      ...METRIC_COUNTS,
      leftOf: { select: { name: true } },
      rightOf: { select: { name: true } },
    },
  });
  if (!metric) throw new Error("Metric not found");

  const used = usageOf(metric);
  if (used > 0) {
    throw new Error(
      `${metric.name} has ${used} value${
        used === 1 ? "" : "s"
      } recorded and can't be deleted`,
    );
  }

  // Deleting an operand would quietly empty the calculation standing on it, so
  // the calculation has to go, or be pointed elsewhere, first.
  const dependants = [...metric.leftOf, ...metric.rightOf].map((m) => m.name);
  if (dependants.length > 0) {
    throw new Error(
      `${metric.name} is used by ${[...new Set(dependants)].join(", ")} — change those first`,
    );
  }

  await prisma.equityMetric.delete({ where: { id: metricId } });
  revalidatePath("/dashboard/equity");
}

// ─── What one project reports ───────────────────────────

type ReportFieldInput = { metricId: string; required: boolean };

/**
 * Sets which financial fields a project's reports ask for, and which of them a
 * new period can't be filed without.
 *
 * The whole list is submitted rather than a change to it, like the split form
 * and the reading form: a field left out has been taken off this project's
 * questionnaire, and there's no separate remove to forget to call.
 *
 * Taking a field off doesn't touch what was already reported for it. The
 * figures stay, and keep showing up in the history and the charts — the field
 * just stops being asked for from here on.
 */
export async function setEquityReportFields(
  portfolioId: string,
  fields: ReportFieldInput[],
) {
  const user = await requireEquityAccess();

  const rows = fields.filter((f) => f.metricId);
  const ids = rows.map((f) => f.metricId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("A field can only be listed once");
  }

  const metrics = await prisma.equityMetric.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, type: true, group: true },
  });
  const byId = new Map(metrics.map((m) => [m.id, m]));

  for (const row of rows) {
    const metric = byId.get(row.metricId);
    if (!metric) throw new Error("That field no longer exists");
    if (metric.group !== "FINANCIAL") {
      throw new Error(`${metric.name} isn't a financial field`);
    }
    // Nobody types a calculated field in, so there's no box to leave empty and
    // nothing for "required" to mean. Requiring what it stands on is the way to
    // guarantee it comes out.
    if (row.required && isFormulaMetric(metric.type)) {
      throw new Error(`${metric.name} is calculated, so it can't be required`);
    }
  }

  const existing = await prisma.equityPortfolioField.findMany({
    where: { portfolioId },
    include: { metric: { select: { name: true } } },
  });

  await prisma.$transaction([
    prisma.equityPortfolioField.deleteMany({
      where: { portfolioId, metricId: { notIn: ids.length > 0 ? ids : [""] } },
    }),
    ...rows.map((row, i) =>
      prisma.equityPortfolioField.upsert({
        where: {
          portfolioId_metricId: { portfolioId, metricId: row.metricId },
        },
        create: {
          portfolioId,
          metricId: row.metricId,
          required: row.required,
          order: i + 1,
        },
        update: { required: row.required, order: i + 1 },
      }),
    ),
  ]);

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "FINANCIALS",
    action: "updated",
    subject: "Reported figures",
    changes: diffSnapshots(reportFieldsSnapshot(existing), {
      // A field dropped from the list is reported as cleared, which a diff of
      // the remaining ones alone would pass over in silence.
      ...Object.fromEntries(existing.map((f) => [f.metric.name, null])),
      ...reportFieldsSnapshot(
        rows.map((row) => ({
          required: row.required,
          metric: { name: byId.get(row.metricId)?.name ?? "" },
        })),
      ),
    }),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

/** The questionnaire as a line per field, so the history reads as prose. */
function reportFieldsSnapshot(
  fields: { required: boolean; metric: { name: string } }[],
): Snapshot {
  return Object.fromEntries(
    fields.map((f) => [f.metric.name, f.required ? "Required" : "Optional"]),
  );
}

// ─── Performance readings ───────────────────────────────

type PerformanceValueInput = {
  metricId: string;
  /** Whichever of the two the metric's type calls for; the other is ignored. */
  numberValue?: number | null;
  dateValue?: string | null;
};

type PerformanceEntryInput = {
  recordedOn: string;
  notes?: string | null;
  values: PerformanceValueInput[];
};

const PERFORMANCE_VALUES_INCLUDE = {
  values: {
    orderBy: { order: "asc" as const },
    include: { metric: { select: { name: true, type: true, unit: true } } },
  },
};

type StoredValue = {
  numberValue: number | null;
  dateValue: Date | null;
  metric: { name: string; type: string; unit: string | null };
};

/**
 * Rows as they'll be stored, with the value put in the column its metric calls
 * for. Rows without a metric picked are dropped rather than rejected — the form
 * starts every new line empty, and an untouched one isn't an error. A metric
 * named twice in one reading is refused, being two answers to one question.
 */
async function preparePerformanceValues(values: PerformanceValueInput[]) {
  const rows = values.filter((v) => v.metricId);
  if (rows.length === 0) throw new Error("Add at least one metric to record");

  const ids = rows.map((v) => v.metricId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("A metric can only be recorded once per reading");
  }

  const metrics = await prisma.equityMetric.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, type: true },
  });
  const byId = new Map(metrics.map((m) => [m.id, m]));

  return rows.map((row, i) => {
    const metric = byId.get(row.metricId);
    if (!metric) throw new Error("That metric no longer exists");

    if (isDateMetric(metric.type)) {
      const date = row.dateValue ? new Date(row.dateValue) : null;
      if (date && Number.isNaN(date.getTime())) {
        throw new Error(`${metric.name} needs a valid date`);
      }
      return {
        metricId: metric.id,
        order: i + 1,
        numberValue: null,
        dateValue: date,
      };
    }

    return {
      metricId: metric.id,
      order: i + 1,
      numberValue: row.numberValue ?? null,
      dateValue: null,
    };
  });
}

/** UTC midnight, so two readings on one day are the same day. */
function parseRecordedOn(raw: string) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** How a reading is named in the history — the day it was taken. */
function readingLabel(date: Date) {
  return day(date) ?? "Reading";
}

/** A reading as its rows read on the card: one metric per line. */
function performanceSnapshot(values: StoredValue[]): Snapshot {
  const snapshot: Snapshot = {};
  for (const value of values) {
    snapshot[value.metric.name] = formatMetricValue(value.metric, value);
  }
  return snapshot;
}

export async function addEquityPerformanceEntry(
  portfolioId: string,
  input: PerformanceEntryInput,
) {
  const user = await requireEquityAccess();
  const values = await preparePerformanceValues(input.values);
  const recordedOn = parseRecordedOn(input.recordedOn);

  const entry = await prisma.equityPerformanceEntry.create({
    data: {
      portfolioId,
      recordedOn,
      notes: input.notes?.trim() || null,
      values: { create: values },
    },
    include: PERFORMANCE_VALUES_INCLUDE,
  });

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "PERFORMANCE",
    action: "created",
    subject: readingLabel(recordedOn),
    changes: diffSnapshots(null, performanceSnapshot(entry.values)),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
  return { id: entry.id };
}

/**
 * Rewrites one reading. Like the split form, this submits the finished picture
 * rather than a diff, so rows absent from it have been taken out.
 */
export async function updateEquityPerformanceEntry(
  entryId: string,
  input: PerformanceEntryInput,
) {
  const user = await requireEquityAccess();
  const existing = await prisma.equityPerformanceEntry.findUnique({
    where: { id: entryId },
    include: PERFORMANCE_VALUES_INCLUDE,
  });
  if (!existing) throw new Error("Reading not found");

  const values = await preparePerformanceValues(input.values);
  const recordedOn = parseRecordedOn(input.recordedOn);
  const { portfolioId } = existing;

  await prisma.$transaction([
    prisma.equityPerformanceEntry.update({
      where: { id: entryId },
      data: { recordedOn, notes: input.notes?.trim() || null },
    }),
    prisma.equityPerformanceValue.deleteMany({ where: { entryId } }),
    prisma.equityPerformanceValue.createMany({
      data: values.map((v) => ({ entryId, ...v })),
    }),
  ]);

  const after = await prisma.equityPerformanceValue.findMany({
    where: { entryId },
    orderBy: { order: "asc" },
    include: { metric: { select: { name: true, type: true, unit: true } } },
  });

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "PERFORMANCE",
    action: "updated",
    subject: readingLabel(recordedOn),
    changes: [
      ...diffSnapshots(
        { Date: day(existing.recordedOn) },
        { Date: day(recordedOn) },
      ),
      // Metrics dropped from the reading are reported as cleared, which a plain
      // diff of the new rows alone would miss.
      ...diffSnapshots(performanceSnapshot(existing.values), {
        ...Object.fromEntries(
          existing.values.map((v) => [v.metric.name, null]),
        ),
        ...performanceSnapshot(after),
      }),
    ],
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

export async function deleteEquityPerformanceEntry(entryId: string) {
  const user = await requireEquityAccess();
  const entry = await prisma.equityPerformanceEntry.delete({
    where: { id: entryId },
    include: { _count: { select: { values: true } } },
  });

  await logEquityEvent({
    portfolioId: entry.portfolioId,
    userId: user.id,
    section: "PERFORMANCE",
    action: "deleted",
    subject: readingLabel(entry.recordedOn),
    label: "Reading",
    oldValue: `${entry._count.values} ${
      entry._count.values === 1 ? "metric" : "metrics"
    }`,
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${entry.portfolioId}`);
}

// ─── Team ───────────────────────────────────────────────
// Who is building the project, dated. A lineup is written whole and kept: the
// latest is the team, and the ones before it are how it got there.

type TeamMemberInput = {
  holderId: string;
  title?: string | null;
  body?: string | null;
};

type TeamSnapshotInput = {
  effectiveOn: string;
  notes?: string | null;
  members: TeamMemberInput[];
};

const TEAM_MEMBERS_INCLUDE = {
  members: {
    orderBy: { order: "asc" as const },
    include: { holder: { select: { name: true } } },
  },
};

type StoredMember = {
  title: string | null;
  body: string | null;
  holder: { name: string };
};

/**
 * Rows as they'll be stored. Lines with nobody picked are dropped rather than
 * refused — the form starts every new one empty — and the same person twice is
 * refused, being two answers to what one person does.
 */
async function prepareTeamMembers(members: TeamMemberInput[]) {
  const rows = members.filter((m) => m.holderId);
  if (rows.length === 0) throw new Error("Add at least one person to the team");

  const ids = rows.map((m) => m.holderId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Someone is on this team twice");
  }

  const known = await prisma.equityHolder.count({ where: { id: { in: ids } } });
  if (known !== ids.length) throw new Error("That name no longer exists");

  return rows.map((row, i) => ({
    holderId: row.holderId,
    title: row.title?.trim() || null,
    body: row.body?.trim() || null,
    order: i + 1,
  }));
}

/** How a lineup is named in the history — the day it took effect. */
function lineupLabel(date: Date) {
  return day(date) ?? "Team";
}

/** A lineup as it reads on the card: one person per line. */
function teamSnapshotOf(members: StoredMember[]): Snapshot {
  const snapshot: Snapshot = {};
  for (const member of members) {
    snapshot[member.holder.name] =
      [member.title, member.body].filter(Boolean).join(" — ") || "On the team";
  }
  return snapshot;
}

export async function addEquityTeamSnapshot(
  portfolioId: string,
  input: TeamSnapshotInput,
) {
  const user = await requireEquityAccess();
  const members = await prepareTeamMembers(input.members);
  const effectiveOn = parseRecordedOn(input.effectiveOn);

  const snapshot = await prisma.equityTeamSnapshot.create({
    data: {
      portfolioId,
      effectiveOn,
      notes: input.notes?.trim() || null,
      members: { create: members },
    },
    include: TEAM_MEMBERS_INCLUDE,
  });

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "TEAM",
    action: "created",
    subject: lineupLabel(effectiveOn),
    changes: diffSnapshots(null, teamSnapshotOf(snapshot.members)),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
  return { id: snapshot.id };
}

/**
 * Rewrites one lineup. Like the split form, this submits the finished picture
 * rather than a diff, so anyone absent from it has left the team.
 */
export async function updateEquityTeamSnapshot(
  snapshotId: string,
  input: TeamSnapshotInput,
) {
  const user = await requireEquityAccess();
  const existing = await prisma.equityTeamSnapshot.findUnique({
    where: { id: snapshotId },
    include: TEAM_MEMBERS_INCLUDE,
  });
  if (!existing) throw new Error("Team not found");

  const members = await prepareTeamMembers(input.members);
  const effectiveOn = parseRecordedOn(input.effectiveOn);
  const { portfolioId } = existing;

  await prisma.$transaction([
    prisma.equityTeamSnapshot.update({
      where: { id: snapshotId },
      data: { effectiveOn, notes: input.notes?.trim() || null },
    }),
    prisma.equityTeamMember.deleteMany({ where: { snapshotId } }),
    prisma.equityTeamMember.createMany({
      data: members.map((m) => ({ snapshotId, ...m })),
    }),
  ]);

  const after = await prisma.equityTeamMember.findMany({
    where: { snapshotId },
    orderBy: { order: "asc" },
    include: { holder: { select: { name: true } } },
  });

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "TEAM",
    action: "updated",
    subject: lineupLabel(effectiveOn),
    changes: [
      ...diffSnapshots(
        { Date: day(existing.effectiveOn) },
        { Date: day(effectiveOn) },
      ),
      // Anyone dropped from the lineup is reported as gone, which a diff of the
      // new rows alone would miss.
      ...diffSnapshots(teamSnapshotOf(existing.members), {
        ...Object.fromEntries(existing.members.map((m) => [m.holder.name, null])),
        ...teamSnapshotOf(after),
      }),
    ],
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

export async function deleteEquityTeamSnapshot(snapshotId: string) {
  const user = await requireEquityAccess();
  const snapshot = await prisma.equityTeamSnapshot.delete({
    where: { id: snapshotId },
    include: { _count: { select: { members: true } } },
  });

  await logEquityEvent({
    portfolioId: snapshot.portfolioId,
    userId: user.id,
    section: "TEAM",
    action: "deleted",
    subject: lineupLabel(snapshot.effectiveOn),
    label: "Team",
    oldValue: `${snapshot._count.members} ${
      snapshot._count.members === 1 ? "person" : "people"
    }`,
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${snapshot.portfolioId}`);
}

// ─── Financial reports ──────────────────────────────────

type FinancialReportInput = {
  periodType: string;
  periodStart: string;
  audited: boolean;
  needsHelp: boolean;
  helpNotes: string | null;
  /** One per defined financial field the period was reported with. */
  values: PerformanceValueInput[];
};

function financialReportData(data: FinancialReportInput) {
  const periodStart = new Date(data.periodStart);
  if (Number.isNaN(periodStart.getTime())) throw new Error("Invalid period");
  return {
    periodType: data.periodType === "YEARLY" ? "YEARLY" : "QUARTERLY",
    periodStart,
    audited: data.audited,
    needsHelp: data.needsHelp,
    // Dropping the note when the answer flips back to "no" stops a stale ask
    // from lingering invisibly behind a collapsed field.
    helpNotes: data.needsHelp ? data.helpNotes : null,
  };
}

const FINANCIAL_VALUES_INCLUDE = {
  values: {
    orderBy: { order: "asc" as const },
    include: { metric: { select: { name: true, type: true, unit: true } } },
  },
};

/**
 * The reported figures as they'll be stored. The same shape as a performance
 * reading, and refused for the same reasons — a field named twice is two
 * answers to one question — with two more of its own: a field defined for the
 * other module has no business on a report, and a calculated field is read
 * rather than entered, so there's nothing of it to store.
 */
async function prepareFinancialValues(values: PerformanceValueInput[]) {
  const rows = values.filter((v) => v.metricId);
  if (rows.length === 0) return [];

  const ids = rows.map((v) => v.metricId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("A field can only be reported once per period");
  }

  const metrics = await prisma.equityMetric.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, type: true, group: true },
  });
  const byId = new Map(metrics.map((m) => [m.id, m]));

  return rows.map((row, i) => {
    const metric = byId.get(row.metricId);
    if (!metric) throw new Error("That field no longer exists");
    if (metric.group !== "FINANCIAL") {
      throw new Error(`${metric.name} isn't a financial field`);
    }
    if (isFormulaMetric(metric.type)) {
      throw new Error(`${metric.name} is calculated, so it can't be entered`);
    }

    if (isDateMetric(metric.type)) {
      const date = row.dateValue ? new Date(row.dateValue) : null;
      if (date && Number.isNaN(date.getTime())) {
        throw new Error(`${metric.name} needs a valid date`);
      }
      return {
        metricId: metric.id,
        order: i + 1,
        numberValue: null,
        dateValue: date,
      };
    }

    return {
      metricId: metric.id,
      order: i + 1,
      numberValue: row.numberValue ?? null,
      dateValue: null,
    };
  });
}

/**
 * Refuses a period that skips a figure the project has to report.
 *
 * A blank isn't the same as a zero and neither is guessed at here: if a project
 * says it reports Revenue every quarter, a quarter without one is an unfinished
 * report rather than a quarter with no revenue.
 *
 * Checked when a period is filed and not when it's edited afterwards. Requiring
 * a field today says what the next report needs, not that every report already
 * closed is now unopenable — and a field added this year has no figures in the
 * quarters that closed before it.
 */
async function assertRequiredFields(
  portfolioId: string,
  values: PerformanceValueInput[],
) {
  const required = await prisma.equityPortfolioField.findMany({
    where: { portfolioId, required: true },
    orderBy: { order: "asc" },
    include: { metric: { select: { name: true, type: true } } },
  });
  if (required.length === 0) return;

  const given = new Map(
    values.filter((v) => v.metricId).map((v) => [v.metricId, v]),
  );
  const missing = required.filter(
    ({ metricId, metric }) => !isFieldAnswered(metric, given.get(metricId)),
  );
  if (missing.length === 0) return;

  const names = missing.map((f) => f.metric.name);
  throw new Error(
    `${names.join(", ")} ${
      names.length === 1 ? "is" : "are"
    } required on this project's reports`,
  );
}

/**
 * The unique constraint on (portfolio, type, period) is what stops the same
 * quarter being filed twice; this turns Prisma's P2002 into something a person
 * can act on.
 */
function asDuplicatePeriodError(err: unknown): Error {
  const code = (err as { code?: string })?.code;
  if (code === "P2002") {
    return new Error("A report for that period already exists — edit it instead.");
  }
  return err as Error;
}

/** A report as its fields read on the card, for the history. */
function reportSnapshot(report: {
  audited: boolean;
  needsHelp: boolean;
  helpNotes: string | null;
  values: StoredValue[];
}): Snapshot {
  const snapshot: Snapshot = { Audited: asText(report.audited) };
  for (const value of report.values) {
    snapshot[value.metric.name] = formatMetricValue(value.metric, value);
  }
  snapshot["Needs help"] = asText(report.needsHelp);
  snapshot["Help notes"] = report.helpNotes;
  return snapshot;
}

function reportPeriod(report: { periodType: string; periodStart: Date }) {
  const start = report.periodStart;
  if (report.periodType === "YEARLY") return `${start.getFullYear()}`;
  return `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
}

export async function addEquityFinancialReport(
  portfolioId: string,
  data: FinancialReportInput
) {
  const user = await requireEquityAccess();
  await assertRequiredFields(portfolioId, data.values);
  const values = await prepareFinancialValues(data.values);

  try {
    const report = await prisma.equityFinancialReport.create({
      data: {
        portfolioId,
        ...financialReportData(data),
        values: { create: values },
      },
      include: FINANCIAL_VALUES_INCLUDE,
    });
    await logEquityChanges({
      portfolioId,
      userId: user.id,
      section: "FINANCIALS",
      action: "created",
      subject: reportPeriod(report),
      changes: diffSnapshots(null, reportSnapshot(report)),
    });
    revalidatePath("/dashboard/equity");
    revalidatePath(`/dashboard/equity/${portfolioId}`);
    return { id: report.id };
  } catch (err) {
    throw asDuplicatePeriodError(err);
  }
}

/**
 * Rewrites one period. Like the reading form, this submits the finished picture
 * rather than a diff, so a field absent from it has been taken off the report.
 */
export async function updateEquityFinancialReport(
  reportId: string,
  data: FinancialReportInput
) {
  const user = await requireEquityAccess();
  const existing = await prisma.equityFinancialReport.findUnique({
    where: { id: reportId },
    include: FINANCIAL_VALUES_INCLUDE,
  });
  if (!existing) throw new Error("Report not found");

  const values = await prepareFinancialValues(data.values);

  let updated;
  try {
    updated = await prisma.equityFinancialReport.update({
      where: { id: reportId },
      data: {
        ...financialReportData(data),
        values: { deleteMany: {}, create: values },
      },
      include: FINANCIAL_VALUES_INCLUDE,
    });
  } catch (err) {
    throw asDuplicatePeriodError(err);
  }

  await logEquityChanges({
    portfolioId: existing.portfolioId,
    userId: user.id,
    section: "FINANCIALS",
    action: "updated",
    subject: reportPeriod(updated),
    changes: diffSnapshots(reportSnapshot(existing), {
      // Fields dropped from the report are reported as cleared, which a plain
      // diff of the new rows alone would miss.
      ...Object.fromEntries(existing.values.map((v) => [v.metric.name, null])),
      ...reportSnapshot(updated),
    }),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${existing.portfolioId}`);
}

/**
 * Deletes one reported period, once the project's name has been typed back.
 *
 * The check is repeated here rather than trusted from the dialog, for the same
 * reason the portfolio's own delete repeats it: a closed quarter is figures
 * somebody had to go and ask the founders for, and nothing here re-derives them.
 */
export async function deleteEquityFinancialReport(
  reportId: string,
  confirmName: string,
) {
  const user = await requireEquityAccess();
  const existing = await prisma.equityFinancialReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      portfolio: { select: { project: { select: { name: true } } } },
    },
  });
  if (!existing) throw new Error("Report not found");

  const projectName = existing.portfolio.project.name;
  if (confirmName.trim() !== projectName) {
    throw new Error(`Type "${projectName}" exactly to delete this report`);
  }

  const report = await prisma.equityFinancialReport.delete({ where: { id: reportId } });

  await logEquityEvent({
    portfolioId: report.portfolioId,
    userId: user.id,
    section: "FINANCIALS",
    action: "deleted",
    subject: reportPeriod(report),
    label: "Report",
    oldValue: reportPeriod(report),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${report.portfolioId}`);
}

// ─── Opportunity ────────────────────────────────────────
// The pitch for a startup, saved a module at a time. Within a module the rows
// are replaced rather than diffed one by one: the form submits the finished
// picture of that section, so a row the user deleted has to leave with it.

export type OpportunityItemInput = {
  section: string;
  heading?: string | null;
  figure?: string | null;
  caption?: string | null;
  body?: string | null;
  countries?: string[];
  axisX?: number | null;
  axisY?: number | null;
  isUs?: boolean;
  share?: number | null;
  holderId?: string | null;
};

const OPPORTUNITY_SECTIONS = new Set([
  "MARKET_VALIDATION",
  "BUSINESS_MODEL",
  "MARKET_ADOPTION",
  "COMPETITION",
  "ADVANTAGE",
]);

function trimmed(value: string | null | undefined) {
  return value?.trim() || null;
}

/** -100 to 100, or nothing. Anything else is a slider that got away. */
function axis(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.max(-100, Math.min(100, Math.round(value)));
}

/** A percentage of the whole, kept to two decimals and inside 0–100. */
function share(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

/** Uppercased, deduped and checked against the list — anything else is dropped. */
function countryCodes(codes: string[] | undefined) {
  if (!codes) return [];
  const seen = new Set<string>();
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (isCountryCode(code)) seen.add(code);
  }
  return [...seen];
}

/** Empty rows are dropped rather than saved — an added row left untouched. */
function opportunityItemsData(items: OpportunityItemInput[]) {
  return items
    .filter((item) => OPPORTUNITY_SECTIONS.has(item.section))
    .map((item) => ({
      section: item.section,
      heading: trimmed(item.heading),
      figure: trimmed(item.figure),
      caption: trimmed(item.caption),
      body: trimmed(item.body),
      countries: countryCodes(item.countries),
      axisX: axis(item.axisX),
      axisY: axis(item.axisY),
      isUs: item.isUs ?? false,
      share: share(item.share),
      holderId: item.holderId || null,
    }))
    .filter(
      (item) =>
        item.heading ||
        item.figure ||
        item.caption ||
        item.body ||
        item.countries.length > 0 ||
        item.share != null ||
        item.holderId,
    )
    .map((item, i) => ({ ...item, order: i + 1 }));
}

/**
 * Which module a section's changes are filed under in the history. Most are
 * modules in their own right; competitive advantage is still part of the
 * opportunity, so its rows are filed there.
 */
const SECTION_LOGGED_AS: Record<string, EquitySection> = {
  MARKET_VALIDATION: "MARKET_VALIDATION",
  BUSINESS_MODEL: "BUSINESS_MODEL",
  MARKET_ADOPTION: "MARKET_ADOPTION",
  COMPETITION: "COMPETITION",
  ADVANTAGE: "OPPORTUNITY",
};

const OPPORTUNITY_SECTION_LABELS: Record<string, string> = {
  MARKET_VALIDATION: "Market validation",
  BUSINESS_MODEL: "Business model",
  MARKET_ADOPTION: "Market adoption",
  COMPETITION: "Competition",
  ADVANTAGE: "Competitive advantage",
};

type OpportunityRow = {
  section: string;
  heading: string | null;
  figure: string | null;
  caption: string | null;
  body: string | null;
  countries: string[];
  share?: number | null;
  holderId: string | null;
};

/**
 * A repeating row as one line. The rows are replaced wholesale on every save
 * and carry no identity across one, so the history compares them by position
 * within their section and reports what that line now says.
 */
function opportunityRowText(row: OpportunityRow) {
  return (
    [
      row.heading,
      row.share != null ? `${row.share}%` : null,
      row.figure,
      row.caption,
      row.body,
      row.countries.join(", "),
    ]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" · ") || null
  );
}

function bySection(rows: OpportunityRow[]) {
  const sections = new Map<string, (string | null)[]>();
  for (const row of rows) {
    sections.set(row.section, [
      ...(sections.get(row.section) ?? []),
      opportunityRowText(row),
    ]);
  }
  return sections;
}

/** Row-by-row changes within each repeating opportunity section. */
function opportunityRowChanges(before: OpportunityRow[], after: OpportunityRow[]) {
  const oldSections = bySection(before);
  const newSections = bySection(after);
  const changes: { label: string; old: string | null; new: string | null }[] = [];

  for (const section of new Set([...oldSections.keys(), ...newSections.keys()])) {
    const oldRows = oldSections.get(section) ?? [];
    const newRows = newSections.get(section) ?? [];
    const name = OPPORTUNITY_SECTION_LABELS[section] ?? section;
    for (let i = 0; i < Math.max(oldRows.length, newRows.length); i++) {
      const old = oldRows[i] ?? null;
      const now = newRows[i] ?? null;
      if (old === now) continue;
      changes.push({ label: `${name} — row ${i + 1}`, old, new: now });
    }
  }
  return changes;
}

/** The long-form fields, and what the history calls each of them. */
const PROSE_LABELS = {
  problem: "Problem",
  solution: "Solution",
  product: "Product",
} as const;

export type PitchProse = Partial<Record<keyof typeof PROSE_LABELS, string | null>>;

/**
 * One or more of the written fields, left alone where they aren't given.
 *
 * Each is edited from its own module now, so a save says which fields it is
 * responsible for rather than sending the lot — otherwise opening one module
 * and saving would blank whatever another module holds.
 */
export async function saveEquityPitchProse(
  portfolioId: string,
  section: EquitySection,
  patch: PitchProse,
) {
  const user = await requireEquityAccess();

  const keys = Object.keys(patch) as (keyof typeof PROSE_LABELS)[];
  const text = Object.fromEntries(
    keys.map((key) => [key, trimmed(patch[key])]),
  ) as PitchProse;

  const before = await prisma.equityOpportunity.findUnique({
    where: { portfolioId },
    select: { problem: true, solution: true, product: true },
  });

  await prisma.equityOpportunity.upsert({
    where: { portfolioId },
    create: { portfolioId, ...text },
    update: text,
  });

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section,
    action: "updated",
    changes: diffSnapshots(
      Object.fromEntries(
        keys.map((key) => [PROSE_LABELS[key], before?.[key] ?? null]),
      ),
      Object.fromEntries(keys.map((key) => [PROSE_LABELS[key], text[key] ?? null])),
    ),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

export type ProductPhotoInput = { url: string; caption: string | null };

/** A shot as the history refers to it: its caption, or the file it came from. */
function photoText(photo: { url: string; caption: string | null }) {
  if (photo.caption) return photo.caption;
  const name = decodeURIComponent(photo.url.split("/").pop() ?? "").split("?")[0];
  return name || photo.url;
}

/**
 * What has been built: the write-up and the screenshots that show it.
 *
 * Both are saved together because they're edited together — the shots are the
 * half of this module that words can't do, and a save that took one without
 * the other would leave a caption describing a picture that isn't there.
 */
export async function saveEquityProduct(
  portfolioId: string,
  input: { text: string | null; photos: ProductPhotoInput[] },
) {
  const user = await requireEquityAccess();

  const text = trimmed(input.text);
  const photos = input.photos
    .map((photo, i) => ({
      url: photo.url.trim(),
      caption: trimmed(photo.caption),
      order: i + 1,
    }))
    .filter((photo) => photo.url);

  const [before, beforePhotos] = await Promise.all([
    prisma.equityOpportunity.findUnique({
      where: { portfolioId },
      select: { product: true },
    }),
    prisma.equityProductPhoto.findMany({
      where: { portfolioId },
      orderBy: { order: "asc" },
    }),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.equityOpportunity.upsert({
      where: { portfolioId },
      create: { portfolioId, product: text },
      update: { product: text },
    });
    await tx.equityProductPhoto.deleteMany({ where: { portfolioId } });
    if (photos.length > 0) {
      await tx.equityProductPhoto.createMany({
        data: photos.map((photo) => ({ ...photo, portfolioId })),
      });
    }
  });

  // Photos are replaced wholesale and carry no identity across a save, so they
  // are compared by position the same way the repeating rows are.
  const photoDiff: EquityChange[] = [];
  for (let i = 0; i < Math.max(beforePhotos.length, photos.length); i++) {
    const old = beforePhotos[i] ? photoText(beforePhotos[i]) : null;
    const now = photos[i] ? photoText(photos[i]) : null;
    if (old !== now) photoDiff.push({ label: `Photo ${i + 1}`, old, new: now });
  }

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "PRODUCT",
    action: "updated",
    changes: [
      ...diffSnapshots({ Product: before?.product ?? null }, { Product: text }),
      ...photoDiff,
    ],
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

/**
 * The rows of a single section, replaced wholesale. Only that section's rows
 * are touched, so each module owns its own save and can't clear another's.
 */
export async function saveEquityPitchSection(
  portfolioId: string,
  section: string,
  items: OpportunityItemInput[],
) {
  const user = await requireEquityAccess();
  if (!OPPORTUNITY_SECTIONS.has(section)) throw new Error("Unknown section");

  const rows = opportunityItemsData(
    items.map((item) => ({ ...item, section })),
  );

  const before = await prisma.equityOpportunity.findUnique({
    where: { portfolioId },
    include: {
      items: { where: { section }, orderBy: { order: "asc" } },
    },
  });

  await prisma.$transaction(async (tx) => {
    const opportunity = await tx.equityOpportunity.upsert({
      where: { portfolioId },
      create: { portfolioId },
      update: {},
    });
    await tx.equityOpportunityItem.deleteMany({
      where: { opportunityId: opportunity.id, section },
    });
    if (rows.length > 0) {
      await tx.equityOpportunityItem.createMany({
        data: rows.map((row) => ({ ...row, opportunityId: opportunity.id })),
      });
    }
  });

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: SECTION_LOGGED_AS[section] ?? "OPPORTUNITY",
    action: "updated",
    changes: opportunityRowChanges(before?.items ?? [], rows),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

// ─── Market size ───────────────────────
// Its own module rather than a section of the opportunity: the tiers are one
// set of amounts drawn against each other, not another list of prose.

export type MarketTierInput = {
  tier: string | null;
  amount: string | null;
  covers: string | null;
  meaning: string | null;
};

/** Empty rows are dropped rather than saved — an added row left untouched. */
function marketTiersData(tiers: MarketTierInput[]) {
  return tiers
    .map((t) => ({
      tier: trimmed(t.tier),
      amount: trimmed(t.amount),
      covers: trimmed(t.covers),
      meaning: trimmed(t.meaning),
    }))
    .filter((t) => t.tier || t.amount || t.covers || t.meaning)
    .map((t, i) => ({ ...t, order: i + 1 }));
}

type MarketTierRow = {
  tier: string | null;
  amount: string | null;
  covers: string | null;
  meaning: string | null;
};

function marketTierText(row: MarketTierRow) {
  return (
    [row.tier, row.amount, row.covers, row.meaning]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" · ") || null
  );
}

/**
 * Tiers are replaced wholesale on every save and carry no identity across one,
 * so the history compares them by position and reports what that tier now says.
 */
function marketTierChanges(before: MarketTierRow[], after: MarketTierRow[]) {
  const changes: EquityChange[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const old = before[i] ? marketTierText(before[i]) : null;
    const now = after[i] ? marketTierText(after[i]) : null;
    if (old === now) continue;
    changes.push({ label: `Tier ${i + 1}`, old, new: now });
  }
  return changes;
}

export async function saveEquityMarketSize(
  portfolioId: string,
  tiers: MarketTierInput[],
) {
  const user = await requireEquityAccess();
  const rows = marketTiersData(tiers);

  const before = await prisma.equityMarketTier.findMany({
    where: { portfolioId },
    orderBy: { order: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    await tx.equityMarketTier.deleteMany({ where: { portfolioId } });
    if (rows.length > 0) {
      await tx.equityMarketTier.createMany({
        data: rows.map((row) => ({ ...row, portfolioId })),
      });
    }
  });

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "MARKET",
    action: "updated",
    changes: marketTierChanges(before, rows),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

// ─── Traction ───────────────────────
// Dated milestones rather than prose: the report reads them oldest first, and
// the dates are as much of the argument as the wording.

export type MilestoneInput = {
  happenedOn: string;
  title: string;
  body: string | null;
  photoUrl: string | null;
};

/**
 * Rows with nothing said in them are dropped — an added row left untouched, or
 * one holding a date and no more. Anything with a title is kept, and one with a
 * date that can't be read is rejected rather than quietly filed under today.
 */
function milestonesData(milestones: MilestoneInput[]) {
  return milestones
    .filter((m) => trimmed(m.title))
    .map((m, i) => ({
      happenedOn: parseRecordedOn(m.happenedOn),
      title: m.title.trim(),
      body: trimmed(m.body),
      photoUrl: trimmed(m.photoUrl),
      order: i + 1,
    }));
}

type MilestoneRow = {
  happenedOn: Date;
  title: string;
  body: string | null;
  photoUrl: string | null;
};

function milestoneText(row: MilestoneRow) {
  return [
    day(row.happenedOn),
    row.title,
    row.body,
    // The URL itself says nothing worth reading in a history line; that one
    // was added or taken away is the change.
    row.photoUrl ? "photo" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Milestones are replaced wholesale on every save and carry no identity across
 * one, so the history compares them by position, as the market tiers do.
 */
function milestoneChanges(before: MilestoneRow[], after: MilestoneRow[]) {
  const changes: EquityChange[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const old = before[i] ? milestoneText(before[i]) : null;
    const now = after[i] ? milestoneText(after[i]) : null;
    if (old === now) continue;
    changes.push({ label: `Milestone ${i + 1}`, old, new: now });
  }
  return changes;
}

export async function saveEquityTraction(
  portfolioId: string,
  milestones: MilestoneInput[],
) {
  const user = await requireEquityAccess();
  const rows = milestonesData(milestones);

  const before = await prisma.equityTractionMilestone.findMany({
    where: { portfolioId },
    orderBy: [{ happenedOn: "asc" }, { order: "asc" }],
  });

  await prisma.$transaction(async (tx) => {
    await tx.equityTractionMilestone.deleteMany({ where: { portfolioId } });
    if (rows.length > 0) {
      await tx.equityTractionMilestone.createMany({
        data: rows.map((row) => ({ ...row, portfolioId })),
      });
    }
  });

  // Compared in the order they're read in rather than the order they were
  // entered, so moving a row up the form isn't reported as two edits.
  const sorted = [...rows].sort(
    (a, b) => a.happenedOn.getTime() - b.happenedOn.getTime(),
  );

  await logEquityChanges({
    portfolioId,
    userId: user.id,
    section: "TRACTION",
    action: "updated",
    changes: milestoneChanges(before, sorted),
  });

  revalidatePath("/dashboard/equity");
  revalidatePath(`/dashboard/equity/${portfolioId}`);
}

// ─── Admin: permission management ───────────────────────
// Guarded on ADMIN rather than equity access, so an admin who holds no grant
// can still hand one out (including to themselves).

export type EquityMember = {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
};

export async function getEquityPermissionAdminData(): Promise<{
  members: EquityMember[];
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
    prisma.equityPermission.findMany({ select: { userId: true } }),
  ]);

  return { members, allowedUserIds: permissions.map((p) => p.userId) };
}

/** Grants or revokes one user's access to the whole Equity module. */
export async function setUserEquityAccess(
  userId: string,
  allowed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireUser();
  if (admin.systemRole !== "ADMIN") return { ok: false, error: "Admin only" };

  if (allowed) {
    await prisma.equityPermission.upsert({
      where: { userId },
      create: { userId, grantedById: admin.id },
      update: {},
    });
  } else {
    await prisma.equityPermission.deleteMany({ where: { userId } });
  }

  // The nav is computed in the dashboard layout, so the whole shell has to be
  // rebuilt for the Equity entry to appear or disappear.
  revalidatePath("/dashboard/admin");
  revalidatePath("/", "layout");
  return { ok: true };
}
