import type { ContractType, TaskType } from "@/generated/prisma/client";

const ALL_TASK_TYPES: TaskType[] = ["FEATURE", "ENHANCEMENT", "BUG", "REPORTED_BUG", "DESIGN"];

const CONTRACT_TASK_RULES: Record<ContractType, TaskType[]> = {
  MAINTENANCE: ["BUG", "REPORTED_BUG"],
  FIXED: ALL_TASK_TYPES,
  PART_TEAM: ALL_TASK_TYPES,
  FULL_TEAM: ALL_TASK_TYPES,
  STARTUP: ALL_TASK_TYPES,
};

export function getAllowedTaskTypes(contractType: ContractType, isAdmin: boolean): TaskType[] {
  if (isAdmin) return ALL_TASK_TYPES;
  return CONTRACT_TASK_RULES[contractType];
}

export interface ActiveContract {
  id: string;
  contractType: ContractType;
  label: string | null;
  startDate: Date | null;
  endDate: Date | null;
}

export function getActiveContract(
  contracts: { id: string; contractType: ContractType; label: string | null; startDate: Date | null; endDate: Date | null }[]
): ActiveContract | null {
  const now = new Date();
  return contracts.find((c) => {
    if (c.contractType === "STARTUP") return true;
    if (!c.startDate || !c.endDate) return false;
    return new Date(c.startDate) <= now && new Date(c.endDate) >= now;
  }) ?? null;
}

export function validateContractDates(
  startDate: Date,
  endDate: Date,
  existing: { id: string; label: string | null; startDate: Date | null; endDate: Date | null }[],
  excludeId?: string
): string | null {
  if (endDate <= startDate) {
    return "End date must be after start date";
  }

  for (const c of existing) {
    if (excludeId && c.id === excludeId) continue;
    if (!c.startDate || !c.endDate) continue;
    const cStart = new Date(c.startDate);
    const cEnd = new Date(c.endDate);
    if (startDate < cEnd && endDate > cStart) {
      return `Dates overlap with contract "${c.label ?? "Untitled"}" (${cStart.toLocaleDateString()} – ${cEnd.toLocaleDateString()})`;
    }
  }

  return null;
}
