// Shared Prisma where-fragment for "project is active": it must have a
// currently valid contract and no active late-payment contract. This is the
// same rule as the Expired / Late Payment badges on project cards
// (see getActiveContract in contract-rules.ts), so anything badged Expired
// stays out of every task-level dashboard/audit monitor.
//
// endDate is compared against start-of-today because contracts are valid
// through the end of their last day (isContractActiveOnDate uses 23:59:59).
export function activeProjectFilter() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const inWindow = {
    startDate: { lte: now },
    endDate: { gte: startOfToday },
  };

  return {
    AND: [
      { contracts: { some: { ...inWindow, latePayment: false } } },
      { contracts: { none: { ...inWindow, latePayment: true } } },
    ],
  };
}
