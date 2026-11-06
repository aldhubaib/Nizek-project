import { MOVABLE_STAGE_IDS } from "@/lib/permissions";
import { STAGE_ORDER } from "@/lib/task-stage";

/**
 * A role's stage grid, as the live panel keeps it in one JSON column: the moves it allows
 * (`from → [to...]`) and, under `_modify`, the stages whose tasks it may edit. Modify applies
 * to every stage; Forward and Rollback only along the chain a card is moved by hand (Backlog,
 * To do, In development, Internal review, Done) — the other stages follow the sprint.
 */

export interface StagePerms {
  transitions: Record<string, string[]>;
  modifyStages: string[];
}

export const EMPTY_STAGE_PERMS: StagePerms = { transitions: {}, modifyStages: [] };

export const ALL_STAGE_IDS: string[] = [...STAGE_ORDER];

export function parseStagePerms(raw: string | null | undefined): StagePerms {
  if (!raw) return { transitions: {}, modifyStages: [] };
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const modifyStages = Array.isArray(data._modify) ? (data._modify as string[]) : [];
    const transitions: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(data)) {
      if (!key.startsWith("_") && Array.isArray(val)) transitions[key] = val as string[];
    }
    return { transitions, modifyStages };
  } catch {
    return { transitions: {}, modifyStages: [] };
  }
}

/** The JSON the server stores: the moves, plus `_modify` when any stage is editable. */
export function serializeStagePerms(perms: StagePerms): Record<string, string[]> {
  const out: Record<string, string[]> = { ...perms.transitions };
  if (perms.modifyStages.length > 0) out._modify = perms.modifyStages;
  return out;
}

export function toggleModify(perms: StagePerms, stage: string): StagePerms {
  const on = perms.modifyStages.includes(stage);
  return { ...perms, modifyStages: on ? perms.modifyStages.filter((s) => s !== stage) : [...perms.modifyStages, stage] };
}

export function toggleTransition(perms: StagePerms, from: string, to: string): StagePerms {
  const current = perms.transitions[from] ?? [];
  const next = current.includes(to) ? current.filter((s) => s !== to) : [...current, to];
  const transitions = { ...perms.transitions };
  if (next.length === 0) delete transitions[from];
  else transitions[from] = next;
  return { ...perms, transitions };
}

/** Each stage's row of the grid: the one it steps forward to and the one it rolls back to, along the movable chain. */
export function stageGridRows(): { id: string; next: string | null; prev: string | null }[] {
  return ALL_STAGE_IDS.map((id) => {
    const i = MOVABLE_STAGE_IDS.indexOf(id);
    return { id, next: i === -1 ? null : (MOVABLE_STAGE_IDS[i + 1] ?? null), prev: i === -1 ? null : (MOVABLE_STAGE_IDS[i - 1] ?? null) };
  });
}

export function hasTransitions(perms: StagePerms): boolean {
  return Object.keys(perms.transitions).length > 0;
}
