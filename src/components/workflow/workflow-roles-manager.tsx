"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Shield, Trash2, UserRound, Users, X } from "lucide-react";
import {
  createWorkflowRole,
  deleteWorkflowRole,
  getWorkflowRoleSettings,
  removeWorkflowMember,
  setWorkflowMemberRole,
  updateWorkflowRole,
  type WorkflowRoleCandidateDTO,
  type WorkflowRoleDTO,
  type WorkflowRoleSettingsDTO,
} from "@/actions/workflow-role";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBody } from "@/components/page-body";
import { AddButton } from "@/components/add-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function WorkflowRolesManager({
  entityType,
  projectId = "",
  backHref,
  backLabel,
  title = "Board roles",
}: {
  entityType: string;
  projectId?: string;
  backHref: string;
  backLabel: string;
  title?: string;
}) {
  const [settings, setSettings] = useState<WorkflowRoleSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingFlowId, setAddingFlowId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getWorkflowRoleSettings(entityType, projectId);
      if (!data) {
        setSettings(null);
        return;
      }
      setSettings({
        ...data,
        flows: (data.flows ?? []).map((flow) => ({
          ...flow,
          roles: (flow.roles ?? []).map((role) => ({
            ...role,
            inUse: role.inUse === true,
            members: role.members ?? [],
          })),
        })),
        people: data.people ?? [],
      });
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }, [entityType, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<{ success: boolean; error?: string } | undefined>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        if (!result?.success) {
          setError(result?.error ?? "Something went wrong.");
          return false;
        }
        await load();
        return true;
      } catch (error) {
        setError(
          error instanceof Error && error.message
            ? error.message
            : "Something went wrong.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  async function addRole(workflowId: string) {
    const name = newRoleName.trim();
    if (!name) {
      setError("A role needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createWorkflowRole({
        entityType,
        projectId,
        workflowId,
        name,
      });
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setNewRoleName("");
      setAddingFlowId(null);
      setExpandedRoleId(result.data.id);
      await load();
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader>
          <PageBackButton href={backHref} label={backLabel} />
          <PageName>{title}</PageName>
        </PageHeader>
        <PageBody className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </PageBody>
      </div>
    );
  }

  if (!settings) {
    return (
      <div>
        <PageHeader>
          <PageBackButton href={backHref} label={backLabel} />
          <PageName>{title}</PageName>
        </PageHeader>
        <PageBody className="py-10">
          <p className="text-center text-s text-muted-foreground">
            You do not have permission to manage roles on this board.
          </p>
        </PageBody>
      </div>
    );
  }

  return (
    <div>
      <PageHeader>
        <PageBackButton href={backHref} label={backLabel} />
        <PageName>{title}</PageName>
      </PageHeader>
      <PageBody className="space-y-10 py-8">
        {error ? <p className="text-s text-destructive">{error}</p> : null}

        {(settings.flows ?? []).length === 0 ? (
          <p className="text-s text-muted-foreground">
            Create a task flow first, then add roles to it.
          </p>
        ) : (
          (settings.flows ?? []).map((flow) => (
            <section key={flow.id}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-s font-semibold text-foreground">
                    {flow.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Roles for this task flow. What they may edit and which
                    moves they may take is set on the blueprint.
                  </p>
                </div>
                <AddButton
                  label={`New role on ${flow.name}`}
                  onClick={() => {
                    setAddingFlowId(
                      addingFlowId === flow.id ? null : flow.id,
                    );
                    setNewRoleName("");
                  }}
                />
              </div>

              {addingFlowId === flow.id ? (
                <form
                  className="mb-4 space-y-3 rounded-lg border border-primary/30 bg-card p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addRole(flow.id);
                  }}
                >
                  <Input
                    autoFocus
                    value={newRoleName}
                    onChange={(event) => setNewRoleName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setAddingFlowId(null);
                    }}
                    placeholder="Role name (e.g. Writer)"
                    className="h-8 text-s"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddingFlowId(null)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={busy}>
                      Create role
                    </Button>
                  </div>
                </form>
              ) : null}

              {(flow.roles ?? []).length === 0 && addingFlowId !== flow.id ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card py-8 text-center">
                  <Shield
                    className="h-8 w-8 text-muted-foreground opacity-50"
                    strokeWidth={1.5}
                  />
                  <p className="text-s text-muted-foreground">
                    No roles on this task flow yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(flow.roles ?? []).map((role) => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      people={settings.people ?? []}
                      entityType={entityType}
                      projectId={projectId}
                      busy={busy}
                      expanded={expandedRoleId === role.id}
                      onToggle={() =>
                        setExpandedRoleId(
                          expandedRoleId === role.id ? null : role.id,
                        )
                      }
                      run={run}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </PageBody>
    </div>
  );
}

function RoleCard({
  role,
  people,
  entityType,
  projectId,
  busy,
  expanded,
  onToggle,
  run,
}: {
  role: WorkflowRoleDTO;
  people: WorkflowRoleCandidateDTO[];
  entityType: string;
  projectId: string;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  run: (
    action: () => Promise<{ success: boolean; error?: string } | undefined>,
  ) => Promise<boolean>;
}) {
  const members = role.members ?? [];
  const inRole = new Set(members.map((member) => member.userId));
  const available = (people ?? []).filter((person) => !inRole.has(person.userId));
  const canDelete = !busy && !role.inUse && members.length === 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/20">
      {expanded ? (
        <div className="space-y-3">
          <InlineName
            value={role.name}
            disabled={busy}
            onSave={(name) => updateWorkflowRole({ roleId: role.id, name })}
            run={run}
          />
          <div className="space-y-1">
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nobody in this role yet.
              </p>
            ) : (
              members.map((member) => (
                <div key={member.id} className="flex items-center gap-2 py-1">
                  <Face name={member.name} imageUrl={member.imageUrl} />
                  <span className="min-w-0 flex-1 truncate text-s">
                    {member.name ?? member.email}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      void run(() =>
                        removeWorkflowMember({
                          entityType,
                          projectId,
                          userId: member.userId,
                          roleId: role.id,
                        }),
                      )
                    }
                    aria-label={`Remove ${member.name ?? member.email} from ${role.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              ))
            )}
          </div>
          {available.length > 0 ? (
            <select
              disabled={busy}
              defaultValue=""
              aria-label={`Add someone to ${role.name}`}
              onChange={(event) => {
                const userId = event.target.value;
                event.target.value = "";
                if (!userId) return;
                void run(() =>
                  setWorkflowMemberRole({
                    entityType,
                    projectId,
                    userId,
                    roleId: role.id,
                  }),
                );
              }}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="">Add someone…</option>
              {available.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name ?? person.email}
                </option>
              ))}
            </select>
          ) : null}
          {role.inUse ? (
            <p className="text-xs text-muted-foreground">
              This role is used on the blueprint. Uncheck it there before
              deleting it.
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onToggle}>
              <X className="me-1 h-3.5 w-3.5" />
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Shield
                className="h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="truncate text-s font-medium">{role.name}</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium",
                  role.inUse
                    ? "border-success/30 bg-success/15 text-success"
                    : "border-border bg-muted text-muted-foreground/50",
                )}
              >
                {role.inUse ? "In use" : "Not in use"}
              </span>
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> {members.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                aria-label={`Edit ${role.name}`}
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                disabled={!canDelete}
                onClick={() => void run(() => deleteWorkflowRole(role.id))}
                aria-label={`Delete ${role.name}`}
                title={
                  role.inUse
                    ? "Uncheck this role on the blueprint first"
                    : members.length > 0
                      ? "Remove everyone from this role first"
                      : undefined
                }
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {role.inUse
              ? "Assigned on this flow's blueprint."
              : "Not used on the blueprint yet."}
          </p>
        </div>
      )}
    </div>
  );
}

function InlineName({
  value,
  disabled,
  onSave,
  run,
}: {
  value: string;
  disabled: boolean;
  onSave: (name: string) => Promise<{ success: boolean; error?: string }>;
  run: (
    action: () => Promise<{ success: boolean; error?: string } | undefined>,
  ) => Promise<boolean>;
}) {
  const [name, setName] = useState(value);
  useEffect(() => setName(value), [value]);
  return (
    <Input
      value={name}
      disabled={disabled}
      autoFocus
      onChange={(event) => setName(event.target.value)}
      onBlur={() => {
        const next = name.trim();
        if (!next || next === value) return;
        void run(() => onSave(next));
      }}
      className="h-8 text-s"
    />
  );
}

function Face({ name, imageUrl }: { name: string | null; imageUrl: string | null }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="size-7 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
      <UserRound className="size-3.5" />
    </span>
  );
}
