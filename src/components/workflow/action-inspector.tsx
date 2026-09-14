"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/boards/board-settings/settings-controls";
import {
  ACTION_REGISTRY,
  configFields,
  configItems,
  configSetField,
  configText,
  configUserIds,
} from "@/lib/workflow/actions";
import {
  WORKFLOW_STATUS_KINDS,
  type WorkflowHook,
  type WorkflowStatusKind,
} from "@/lib/workflow/types";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type {
  WorkflowActionDTO,
  WorkflowStatusDTO,
  WorkflowTransitionDTO,
  WorkflowUserOption,
} from "@/actions/workflow";

export function ActionInspector({
  status,
  outgoing,
  fields,
  users,
  onUpdateStatus,
  onDeleteStatus,
  onDeleteTransition,
  onAddAction,
  onUpdateAction,
  onDeleteAction,
}: {
  status: WorkflowStatusDTO | null;
  outgoing: { transition: WorkflowTransitionDTO; toName: string }[];
  fields: CustomFieldDTO[];
  users: WorkflowUserOption[];
  onUpdateStatus: (
    id: string,
    input: { name?: string; color?: string; kind?: WorkflowStatusKind },
  ) => void;
  onDeleteStatus: (id: string) => void;
  onDeleteTransition: (id: string) => void;
  onAddAction: (input: {
    statusId?: string;
    transitionId?: string;
    hook: WorkflowHook;
    type: string;
  }) => void;
  onUpdateAction: (id: string, input: { config?: unknown; hook?: string }) => void;
  onDeleteAction: (id: string) => void;
}) {
  if (!status) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-s text-muted-foreground">
        Click a status to set what happens when a deal moves there.
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Status
        </p>
        <Input
          key={status.id + status.name}
          defaultValue={status.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== status.name) onUpdateStatus(status.id, { name });
          }}
          className="mt-2"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Color</Label>
        <ColorPicker
          value={status.color}
          onChange={(color) => onUpdateStatus(status.id, { color })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Kind</Label>
        <select
          value={status.kind}
          onChange={(e) => {
            const kind = e.target.value;
            if (!(WORKFLOW_STATUS_KINDS as readonly string[]).includes(kind)) {
              return;
            }
            onUpdateStatus(status.id, { kind: kind as WorkflowStatusKind });
          }}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-s"
        >
          {WORKFLOW_STATUS_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          When a task leaves or arrives
        </p>
        <p className="text-xs text-muted-foreground">
          Required fields here block a move out of {status.name} or into it.
        </p>
        <ActionLists
          actions={status.actions}
          hooks={["during"]}
          fields={fields}
          users={users}
          onAdd={(hook, type) =>
            onAddAction({ statusId: status.id, hook, type })
          }
          onUpdate={onUpdateAction}
          onDelete={onDeleteAction}
        />
      </div>
      {outgoing.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Moves from here
          </p>
          <div className="flex flex-wrap gap-2">
            {outgoing.map(({ transition, toName }) => (
              <span
                key={transition.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
              >
                {toName}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  title={`Remove move to ${toName}`}
                  onClick={() => {
                    if (confirm(`Remove the move to “${toName}”?`)) {
                      onDeleteTransition(transition.id);
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          if (confirm(`Delete the “${status.name}” status?`)) {
            onDeleteStatus(status.id);
          }
        }}
      >
        <Trash2 className="me-1.5 h-3.5 w-3.5" />
        Delete status
      </Button>
    </div>
  );
}

function ActionLists({
  actions,
  hooks,
  fields,
  users,
  onAdd,
  onUpdate,
  onDelete,
}: {
  actions: WorkflowActionDTO[];
  hooks: WorkflowHook[];
  fields: CustomFieldDTO[];
  users: WorkflowUserOption[];
  onAdd: (hook: WorkflowHook, type: string) => void;
  onUpdate: (id: string, input: { config?: unknown }) => void;
  onDelete: (id: string) => void;
}) {
  const catalog = fields.map((f) => ({
    id: f.binding ?? f.id,
    label: f.label,
  }));

  return (
    <div className="space-y-4">
      {hooks.map((hook) => {
        const rows = actions.filter((a) => a.hook === hook);
        const addable = Object.entries(ACTION_REGISTRY).filter(([, def]) =>
          def.hooks.includes(hook),
        );
        return (
          <div key={hook}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {hook}
            </p>
            <div className="space-y-2">
              {rows.map((action) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  catalog={catalog}
                  users={users}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
              <div className="flex flex-wrap gap-1">
                {addable.map(([type, def]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onAdd(hook, type)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    {def.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionRow({
  action,
  catalog,
  users,
  onUpdate,
  onDelete,
}: {
  action: WorkflowActionDTO;
  catalog: { id: string; label: string }[];
  users: WorkflowUserOption[];
  onUpdate: (id: string, input: { config?: unknown }) => void;
  onDelete: (id: string) => void;
}) {
  const label = ACTION_REGISTRY[action.type]?.label ?? action.type;

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-s font-medium">{label}</p>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(action.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {(action.type === "require_fields" || action.type === "show_fields") && (
        <FieldChecks
          selected={configFields(action.config)}
          catalog={catalog}
          onChange={(next) => onUpdate(action.id, { config: { fields: next } })}
        />
      )}
      {action.type === "message" && (
        <Textarea
          defaultValue={configText(action.config)}
          placeholder="Shown when this move is made"
          onBlur={(e) =>
            onUpdate(action.id, { config: { text: e.target.value } })
          }
        />
      )}
      {action.type === "checklist" && (
        <Textarea
          defaultValue={configItems(action.config).join("\n")}
          placeholder={"One item per line"}
          onBlur={(e) =>
            onUpdate(action.id, {
              config: {
                items: e.target.value
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean),
              },
            })
          }
        />
      )}
      {action.type === "set_field" && (
        <div className="grid gap-2">
          <select
            value={configSetField(action.config).field}
            onChange={(e) =>
              onUpdate(action.id, {
                config: { ...configSetField(action.config), field: e.target.value },
              })
            }
            className="h-9 rounded-md border border-input bg-transparent px-2 text-s"
          >
            <option value="">Choose a field</option>
            {catalog.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <Input
            defaultValue={configSetField(action.config).value}
            placeholder="Value to write"
            onBlur={(e) =>
              onUpdate(action.id, {
                config: { ...configSetField(action.config), value: e.target.value },
              })
            }
          />
        </div>
      )}
      {action.type === "notify" && (
        <FieldChecks
          selected={configUserIds(action.config)}
          catalog={users.map((u) => ({ id: u.id, label: u.name }))}
          onChange={(next) => onUpdate(action.id, { config: { userIds: next } })}
        />
      )}
      {(action.type === "associate_contacts" ||
        action.type === "associate_companies") && (
        <p className="text-xs text-muted-foreground">
          The person making the move will be asked to attach{" "}
          {action.type === "associate_contacts" ? "contacts" : "companies"}.
        </p>
      )}
    </div>
  );
}

function FieldChecks({
  selected,
  catalog,
  onChange,
}: {
  selected: string[];
  catalog: { id: string; label: string }[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selected);
  return (
    <div className="space-y-1">
      {catalog.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-s">
          <input
            type="checkbox"
            checked={set.has(item.id)}
            onChange={() => {
              const next = new Set(set);
              if (next.has(item.id)) next.delete(item.id);
              else next.add(item.id);
              onChange([...next]);
            }}
          />
          {item.label}
        </label>
      ))}
      {catalog.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing to pick yet.</p>
      )}
    </div>
  );
}
