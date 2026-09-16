"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/boards/board-settings/settings-controls";
import {
  ACTION_REGISTRY,
  ASSIGN_MOVER,
  configAssignUser,
  configFields,
  configItems,
  configSetField,
  configText,
  configUserIds,
} from "@/lib/workflow/actions";
import {
  WORKFLOW_STATUS_KINDS,
  statusKindsForEntity,
  type WorkflowHook,
  type WorkflowStatusKind,
} from "@/lib/workflow/types";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { ModuleRoleOption } from "@/actions/workflow-role";
import type {
  WorkflowActionDTO,
  WorkflowStatusDTO,
  WorkflowTransitionDTO,
  WorkflowUserOption,
} from "@/actions/workflow";
import { ALL_FIELDS, type ModifyByRoleMap } from "@/lib/workflow-permissions";

function kindOptions(
  entityType: string,
  current: WorkflowStatusKind,
): readonly WorkflowStatusKind[] {
  const kinds = statusKindsForEntity(entityType);
  if ((kinds as readonly string[]).includes(current)) return kinds;
  return [...kinds, current];
}

export function ActionInspector({
  status,
  outgoing,
  fields,
  users,
  roles,
  entityType = "deal",
  onUpdateStatus,
  onUpdateTransition,
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
  roles: ModuleRoleOption[];
  entityType?: string;
  onUpdateStatus: (
    id: string,
    input: {
      name?: string;
      color?: string;
      kind?: WorkflowStatusKind;
      modifyByRole?: ModifyByRoleMap | null;
    },
  ) => void;
  onUpdateTransition: (
    id: string,
    input: { moveRoleIds?: string[] | null },
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
          {kindOptions(entityType, status.kind).map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {entityType === "board"
            ? "Used later in task reports. Open is still in play; closed is finished."
            : "Used later in pipeline reports. Open is still in play; won and lost are outcomes."}
        </p>
      </div>
      <WhoCanEdit
        status={status}
        roles={roles}
        fields={fields}
        onChange={(modifyByRole) =>
          onUpdateStatus(status.id, { modifyByRole })
        }
      />
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
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          When a record arrives
        </p>
        <p className="text-xs text-muted-foreground">
          Runs after the move into {status.name}. Send invite also emails
          when a card leaves this column.
        </p>
        <ActionLists
          actions={status.actions}
          hooks={["after"]}
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
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Moves from here
          </p>
          {outgoing.map(({ transition, toName }) => (
            <div
              key={transition.id}
              className="space-y-2 rounded-md border border-border/70 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-s font-medium">{toName}</span>
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
              </div>
              <WhoCanMove
                roles={roles}
                moveRoleIds={transition.moveRoleIds ?? null}
                onChange={(moveRoleIds) =>
                  onUpdateTransition(transition.id, { moveRoleIds })
                }
              />
            </div>
          ))}
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
  const inviteFields = fields
    .filter((field) => field.type === "invite" && !field.binding)
    .map((field) => ({ id: field.id, label: field.label }));

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
                  inviteFields={inviteFields}
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
  inviteFields,
  users,
  onUpdate,
  onDelete,
}: {
  action: WorkflowActionDTO;
  catalog: { id: string; label: string }[];
  inviteFields: { id: string; label: string }[];
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
      {action.type === "assign_user" && (
        <div className="space-y-1.5">
          <select
            value={configAssignUser(action.config).userId}
            onChange={(e) =>
              onUpdate(action.id, { config: { userId: e.target.value } })
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
          >
            <option value="">Unassigned</option>
            <option value={ASSIGN_MOVER}>Person who moves the card</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Applied when the card arrives here.
          </p>
        </div>
      )}
      {action.type === "send_invite" && (
        <div className="space-y-1.5">
          <select
            value={configSetField(action.config).field}
            onChange={(e) =>
              onUpdate(action.id, { config: { field: e.target.value } })
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
          >
            <option value="">Choose a Calendar invite field</option>
            {inviteFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
          {inviteFields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add a Calendar invite field on the layout first.
            </p>
          )}
        </div>
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

function WhoCanEdit({
  status,
  roles,
  fields,
  onChange,
}: {
  status: WorkflowStatusDTO;
  roles: ModuleRoleOption[];
  fields: CustomFieldDTO[];
  onChange: (next: ModifyByRoleMap | null) => void;
}) {
  const map = status.modifyByRole;
  const restricted = map !== null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Who can edit here
      </p>
      <p className="text-xs text-muted-foreground">
        Turn a role on to say which fields they may change while a card
        is in {status.name}. Leave every role off and anyone on the
        project can still edit here.
      </p>
      {roles.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add board roles from the ⋯ menu first.
        </p>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const current = map?.[role.id];
            const enabled = current !== undefined;
            const all = current === ALL_FIELDS;
            return (
              <div
                key={role.id}
                className="rounded-md border border-border/70 p-2"
              >
                <label className="flex items-center gap-2 text-s">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => {
                      if (!event.target.checked) {
                        if (!map) {
                          onChange(null);
                          return;
                        }
                        const next = { ...map };
                        delete next[role.id];
                        onChange(Object.keys(next).length === 0 ? null : next);
                        return;
                      }
                      onChange({ ...(map ?? {}), [role.id]: ALL_FIELDS });
                    }}
                  />
                  <span className="flex-1">{role.name}</span>
                </label>
                {enabled ? (
                  <div className="mt-2 space-y-1.5 ps-6">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={all}
                        onChange={(event) => {
                          const next = { ...(map ?? {}) };
                          next[role.id] = event.target.checked
                            ? ALL_FIELDS
                            : [];
                          onChange(next);
                        }}
                      />
                      All fields
                    </label>
                    {!all ? (
                      <FieldChecks
                        selected={Array.isArray(current) ? current : []}
                        catalog={fields.map((field) => ({
                          id: field.id,
                          label: field.label,
                        }))}
                        onChange={(next) =>
                          onChange({ ...(map ?? {}), [role.id]: next })
                        }
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {restricted ? (
            <p className="text-xs text-muted-foreground">
              Roles that are not listed cannot edit a card in this column.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function WhoCanMove({
  roles,
  moveRoleIds,
  onChange,
}: {
  roles: ModuleRoleOption[];
  moveRoleIds: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const restricted = moveRoleIds !== null;
  const selected = new Set(moveRoleIds ?? []);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Who can take this move
      </p>
      {roles.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add board roles from the ⋯ menu first.
        </p>
      ) : (
        roles.map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={restricted && selected.has(role.id)}
              onChange={() => {
                if (!restricted) {
                  onChange([role.id]);
                  return;
                }
                const next = selected.has(role.id)
                  ? moveRoleIds!.filter((id) => id !== role.id)
                  : [...moveRoleIds!, role.id];
                onChange(next.length === 0 ? null : next);
              }}
            />
            {role.name}
          </label>
        ))
      )}
      {!restricted ? (
        <p className="text-xs text-muted-foreground">
          Anyone on the project can take this arrow.
        </p>
      ) : null}
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
