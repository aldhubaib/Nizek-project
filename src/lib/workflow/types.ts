export const WORKFLOW_ENTITY_TYPES = [
  "deal",
  "contact",
  "company",
  "board",
] as const;
export type WorkflowEntityType = (typeof WORKFLOW_ENTITY_TYPES)[number];

export const WORKFLOW_STATUS_KINDS = ["open", "won", "lost"] as const;
export type WorkflowStatusKind = (typeof WORKFLOW_STATUS_KINDS)[number];

export const WORKFLOW_HOOKS = [
  "before",
  "during",
  "after",
  "onEnter",
  "onLeave",
] as const;
export type WorkflowHook = (typeof WORKFLOW_HOOKS)[number];

export const WORKFLOW_ACTION_TYPES = [
  "require_fields",
  "show_fields",
  "message",
  "checklist",
  "associate_contacts",
  "associate_companies",
  "set_field",
  "notify",
] as const;
export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

export type WorkflowActionConfig =
  | { fields: string[] }
  | { text: string }
  | { items: string[] }
  | { field: string; value: string }
  | { userIds: string[] }
  | Record<string, never>;

export type WorkflowActionDef = {
  id: string;
  hook: WorkflowHook;
  type: WorkflowActionType;
  config: WorkflowActionConfig;
  position: number;
};

export type WorkflowStatusDef = {
  id: string;
  workflowId: string;
  name: string;
  color: string;
  kind: WorkflowStatusKind;
  position: number;
  canvasX: number | null;
  canvasY: number | null;
  actions: WorkflowActionDef[];
};

export type WorkflowTransitionDef = {
  id: string;
  workflowId: string;
  name: string;
  fromStatusId: string | null;
  toStatusId: string;
  /// Encoded source connector: 1 top, 2 right, 3 bottom, 4 left.
  canvasX: number | null;
  /// Encoded target connector: 1 top, 2 right, 3 bottom, 4 left.
  canvasY: number | null;
  actions: WorkflowActionDef[];
};

export type NativeFieldSnapshot = {
  title: string;
  value: string | null;
  contactIds: string[];
  companyIds: string[];
};

export type FieldSnapshot = {
  native: NativeFieldSnapshot;
  custom: Record<string, string>;
};

export type DuringPayload = {
  customValues?: Record<string, string>;
  nativePatches?: {
    title?: string;
    value?: string | null;
    contactIds?: string[];
    companyIds?: string[];
  };
  checklist?: Record<string, boolean>;
};
