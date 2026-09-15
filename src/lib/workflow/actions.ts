import {
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_HOOKS,
  type WorkflowActionConfig,
  type WorkflowActionType,
  type WorkflowHook,
} from "./types";

export const ACTION_REGISTRY: Record<
  WorkflowActionType,
  {
    label: string;
    hooks: WorkflowHook[];
    description: string;
  }
> = {
  require_fields: {
    label: "Require fields",
    hooks: ["before", "during", "onLeave"],
    description: "Block the move until the listed fields are filled",
  },
  show_fields: {
    label: "Show fields",
    hooks: ["during"],
    description: "Ask for extra fields on the transition dialog",
  },
  message: {
    label: "Message",
    hooks: ["during"],
    description: "Show a note to the person making the move",
  },
  checklist: {
    label: "Checklist",
    hooks: ["during"],
    description: "Every item must be ticked before the move completes",
  },
  associate_contacts: {
    label: "Associate contacts",
    hooks: ["during"],
    description: "Prompt to attach contacts",
  },
  associate_companies: {
    label: "Associate companies",
    hooks: ["during"],
    description: "Prompt to attach companies",
  },
  set_field: {
    label: "Set field",
    hooks: ["before", "after", "onEnter", "onLeave"],
    description: "Write a field to a configured value",
  },
  notify: {
    label: "Notify",
    hooks: ["after", "onEnter"],
    description: "Send an in-app notification to chosen people",
  },
  send_invite: {
    label: "Send invite",
    hooks: ["after", "onEnter", "onLeave", "before"],
    description:
      "Create a Google Calendar event (or email an invite) when a card leaves or arrives here",
  },
  assign_user: {
    label: "Assign",
    hooks: ["after", "onEnter"],
    description: "Set who is responsible when the card arrives here",
  },
};

export function isWorkflowActionType(value: string): value is WorkflowActionType {
  return (WORKFLOW_ACTION_TYPES as readonly string[]).includes(value);
}

export function isWorkflowHook(value: string): value is WorkflowHook {
  return (WORKFLOW_HOOKS as readonly string[]).includes(value);
}

export function parseActionConfig(raw: string): WorkflowActionConfig {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as WorkflowActionConfig;
    }
  } catch {
    // Fall through to empty config.
  }
  return {};
}

export function stringifyActionConfig(config: WorkflowActionConfig): string {
  return JSON.stringify(config ?? {});
}

export function cleanActionConfig(
  type: WorkflowActionType,
  raw: unknown,
): WorkflowActionConfig {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  switch (type) {
    case "require_fields":
    case "show_fields":
      return {
        fields: Array.isArray(input.fields)
          ? input.fields.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
          : [],
      };
    case "message":
      return { text: typeof input.text === "string" ? input.text : "" };
    case "checklist":
      return {
        items: Array.isArray(input.items)
          ? input.items.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
          : [],
      };
    case "set_field":
      return {
        field: typeof input.field === "string" ? input.field : "",
        value: typeof input.value === "string" ? input.value : "",
      };
    case "notify":
      return {
        userIds: Array.isArray(input.userIds)
          ? input.userIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          : [],
      };
    case "send_invite":
      return {
        field: typeof input.field === "string" ? input.field : "",
      };
    case "assign_user":
      return {
        userId: typeof input.userId === "string" ? input.userId : "",
      };
    case "associate_contacts":
    case "associate_companies":
      return {};
  }
}

export function assertActionAllowed(type: WorkflowActionType, hook: WorkflowHook) {
  if (!ACTION_REGISTRY[type].hooks.includes(hook)) {
    throw new Error(
      `${ACTION_REGISTRY[type].label} cannot run ${hook}`,
    );
  }
}

export function configFields(config: WorkflowActionConfig): string[] {
  return "fields" in config && Array.isArray(config.fields) ? config.fields : [];
}

export function configText(config: WorkflowActionConfig): string {
  return "text" in config && typeof config.text === "string" ? config.text : "";
}

export function configItems(config: WorkflowActionConfig): string[] {
  return "items" in config && Array.isArray(config.items) ? config.items : [];
}

export function configSetField(config: WorkflowActionConfig): {
  field: string;
  value: string;
} {
  return {
    field: "field" in config && typeof config.field === "string" ? config.field : "",
    value: "value" in config && typeof config.value === "string" ? config.value : "",
  };
}

export function configUserIds(config: WorkflowActionConfig): string[] {
  return "userIds" in config && Array.isArray(config.userIds)
    ? config.userIds
    : [];
}

/** Empty string unassigns. `__mover__` means the person who made the move. */
export const ASSIGN_MOVER = "__mover__";

export function configAssignUser(config: WorkflowActionConfig): {
  userId: string;
} {
  return {
    userId: "userId" in config && typeof config.userId === "string" ? config.userId : "",
  };
}

export function assignedUserIdFromActions(
  actions: { type: string; config: WorkflowActionConfig }[],
  actorId: string,
): string | undefined {
  let found: string | undefined;
  for (const action of actions) {
    if (action.type !== "assign_user") continue;
    const id = configAssignUser(action.config).userId;
    found = id === ASSIGN_MOVER ? actorId : id;
  }
  return found;
}
