import { NATIVE_DEAL_FIELDS, type CustomFieldType } from "@/lib/fields/types";
import { isModuleBindingKey } from "@/lib/modules/registry";
import {
  customFieldIsFilled,
  mergeSnapshot,
  missingNativeFields,
  nativeFieldIsFilled,
} from "@/lib/fields/validate";
import {
  clearHiddenFieldValues,
  fieldIsLogicallyVisible,
  parseFieldVisibility,
  type FieldVisibility,
} from "@/lib/fields/visibility";
import {
  configFields,
  configItems,
  configSetField,
  configText,
} from "./actions";
import type {
  DuringPayload,
  FieldSnapshot,
  WorkflowActionDef,
  WorkflowTransitionDef,
} from "./types";

/**
 * Whether a drop is legal on this workflow.
 *
 * No transitions means the blueprint has not been drawn yet, so any destination
 * (including Unassigned / null) is allowed. The first arrow turns the process
 * on: Unassigned is then off the table, and only listed moves pass.
 * A record with no status yet may enter any column — it is arriving, not leaving.
 * `enabled: false` is the same as no transitions — the process is switched off.
 */
export function isMoveAllowed(input: {
  fromStatusId: string | null;
  toStatusId: string | null;
  transitionCount: number;
  allowedToIds: string[];
  enabled?: boolean;
}): boolean {
  if (input.enabled === false) return true;
  if (input.transitionCount === 0) return true;
  if (input.toStatusId === null) return false;
  if (input.fromStatusId === null) return true;
  if (input.fromStatusId === input.toStatusId) return true;
  return input.allowedToIds.includes(input.toStatusId);
}

/** Destinations reachable from a status, including common (from-any) transitions. */
export function allowedDestinations(
  fromStatusId: string | null,
  transitions: Pick<WorkflowTransitionDef, "fromStatusId" | "toStatusId">[],
): string[] {
  const ids = new Set<string>();
  for (const transition of transitions) {
    if (transition.fromStatusId === null || transition.fromStatusId === fromStatusId) {
      if (transition.toStatusId !== fromStatusId) ids.add(transition.toStatusId);
    }
  }
  return [...ids];
}

export function findTransition(
  fromStatusId: string | null,
  toStatusId: string | null,
  transitions: WorkflowTransitionDef[],
): WorkflowTransitionDef | null {
  if (!toStatusId || fromStatusId === toStatusId) return null;
  return (
    transitions.find(
      (t) => t.fromStatusId === fromStatusId && t.toStatusId === toStatusId,
    ) ??
    transitions.find(
      (t) => t.fromStatusId === null && t.toStatusId === toStatusId,
    ) ??
    null
  );
}

export function actionsForMove(input: {
  fromActions: WorkflowActionDef[];
  toActions: WorkflowActionDef[];
  transition: WorkflowTransitionDef | null;
}): {
  before: WorkflowActionDef[];
  during: WorkflowActionDef[];
  after: WorkflowActionDef[];
} {
  const transitionActions = input.transition?.actions ?? [];
  const before = [
    ...input.fromActions.filter((a) => a.hook === "onLeave" || a.hook === "before"),
    ...transitionActions.filter((a) => a.hook === "before"),
  ];
  const during = [
    ...input.fromActions.filter((a) => a.hook === "during"),
    ...input.toActions.filter((a) => a.hook === "during"),
    ...transitionActions.filter((a) => a.hook === "during"),
  ];
  const after = [
    ...transitionActions.filter((a) => a.hook === "after"),
    ...input.toActions.filter((a) => a.hook === "onEnter" || a.hook === "after"),
  ];
  return { before, during, after };
}

/** Send invite on the column you leave, the column you enter, or the arrow. */
export function sendInviteActionsForMove(input: {
  fromActions: WorkflowActionDef[];
  toActions: WorkflowActionDef[];
  transition: WorkflowTransitionDef | null;
}): WorkflowActionDef[] {
  const transitionActions = input.transition?.actions ?? [];
  const seen = new Set<string>();
  const out: WorkflowActionDef[] = [];
  for (const action of [
    ...input.fromActions,
    ...input.toActions,
    ...transitionActions,
  ]) {
    if (action.type !== "send_invite") continue;
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    out.push(action);
  }
  return out;
}

export function moveNeedsDialog(during: WorkflowActionDef[]): boolean {
  return during.length > 0;
}

type CustomFieldLookup = {
  id: string;
  label: string;
  type: CustomFieldType;
  visibility?: FieldVisibility | string | null;
};

function lookupIsVisible(
  field: CustomFieldLookup,
  snapshot: FieldSnapshot,
  customFields: CustomFieldLookup[],
): boolean {
  return fieldIsLogicallyVisible(
    { visibility: parseFieldVisibility(field.visibility) },
    snapshot.custom,
    customFields.map((row) => row.id),
  );
}

function isNativeFieldId(id: string): boolean {
  return (
    isModuleBindingKey(id) ||
    NATIVE_DEAL_FIELDS.some((field) => field.id === id)
  );
}

export function missingRequiredOnSnapshot(
  snapshot: FieldSnapshot,
  fieldIds: string[],
  customFields: CustomFieldLookup[],
): string[] {
  const nativeMissing = missingNativeFields(snapshot.native, fieldIds);
  const missing = [...nativeMissing];
  for (const id of fieldIds) {
    if (isNativeFieldId(id)) continue;
    const field = customFields.find((f) => f.id === id);
    if (!field) continue;
    if (!lookupIsVisible(field, snapshot, customFields)) continue;
    if (!customFieldIsFilled(field.type, snapshot.custom[id])) {
      missing.push(field.label);
    }
  }
  return missing;
}

export function requiredFieldIds(actions: WorkflowActionDef[]): string[] {
  const ids = new Set<string>();
  for (const action of actions) {
    if (action.type !== "require_fields") continue;
    for (const id of configFields(action.config)) ids.add(id);
  }
  return [...ids];
}

export function shownFieldIds(actions: WorkflowActionDef[]): string[] {
  const ids = new Set<string>();
  for (const action of actions) {
    if (action.type !== "show_fields" && action.type !== "require_fields") continue;
    for (const id of configFields(action.config)) ids.add(id);
  }
  return [...ids];
}

/** True when the record already holds an answer for this native or custom field. */
export function snapshotFieldIsFilled(
  snapshot: FieldSnapshot,
  fieldId: string,
  customFields: CustomFieldLookup[],
): boolean {
  const native = NATIVE_DEAL_FIELDS.find((field) => field.id === fieldId);
  if (native) return nativeFieldIsFilled(native.id, snapshot.native);
  const field = customFields.find((row) => row.id === fieldId);
  if (!field) return false;
  if (!lookupIsVisible(field, snapshot, customFields)) return true;
  return customFieldIsFilled(field.type, snapshot.custom[fieldId]);
}

/** Fields the transition dialog still needs to ask for. */
export function unfilledFieldIds(
  fieldIds: string[],
  snapshot: FieldSnapshot,
  customFields: CustomFieldLookup[],
): string[] {
  return fieldIds.filter(
    (id) => !snapshotFieldIsFilled(snapshot, id, customFields),
  );
}

export function validateDuring(
  during: WorkflowActionDef[],
  snapshot: FieldSnapshot,
  payload: DuringPayload,
  customFields: CustomFieldLookup[],
): string[] {
  const merged = mergeSnapshot(snapshot, payload.customValues, payload.nativePatches);
  const errors: string[] = [];

  const required = requiredFieldIds(during);
  const missing = missingRequiredOnSnapshot(merged, required, customFields);
  if (missing.length > 0) {
    errors.push(`Fill ${missing.join(", ")}`);
  }

  for (const action of during) {
    if (action.type === "message" && !configText(action.config).trim()) {
      continue;
    }
    if (action.type === "checklist") {
      const items = configItems(action.config);
      const ticks = payload.checklist ?? {};
      const undone = items.filter((item) => !ticks[item]);
      if (undone.length > 0) {
        errors.push(`Tick every checklist item`);
        break;
      }
    }
  }

  return errors;
}

export function applySetFieldActions(
  actions: WorkflowActionDef[],
  snapshot: FieldSnapshot,
  customFields: CustomFieldLookup[] = [],
): FieldSnapshot {
  let next = snapshot;
  for (const action of actions) {
    if (action.type !== "set_field") continue;
    const { field, value } = configSetField(action.config);
    if (!field) continue;
    if (isNativeFieldId(field)) {
      next = {
        ...next,
        native: applyNativeSet(next.native, field, value),
      };
    } else {
      next = {
        ...next,
        custom: { ...next.custom, [field]: value },
      };
    }
  }
  if (customFields.length === 0) return next;
  return {
    ...next,
    custom: clearHiddenFieldValues(customFields, next.custom),
  };
}

function applyNativeSet(
  native: FieldSnapshot["native"],
  field: string,
  value: string,
): FieldSnapshot["native"] {
  switch (field) {
    case "title":
      return { ...native, title: value };
    case "value":
      return { ...native, value: value === "" ? null : value };
    default:
      return native;
  }
}

export function notifyUserIds(actions: WorkflowActionDef[]): string[] {
  const ids = new Set<string>();
  for (const action of actions) {
    if (action.type !== "notify") continue;
    const list =
      "userIds" in action.config && Array.isArray(action.config.userIds)
        ? action.config.userIds
        : [];
    for (const id of list) ids.add(id);
  }
  return [...ids];
}

