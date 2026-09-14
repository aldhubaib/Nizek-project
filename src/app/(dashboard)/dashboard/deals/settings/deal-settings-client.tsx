"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBody } from "@/components/page-body";
import {
  BlueprintCanvas,
  encodeHandle,
} from "@/components/workflow/blueprint-canvas";
import { ActionInspector } from "@/components/workflow/action-inspector";
import {
  saveWorkflowBlueprint,
  updateWorkflow,
  type WorkflowSettingsDTO,
  type WorkflowStatusDTO,
  type WorkflowUserOption,
} from "@/actions/workflow";
import type { CustomFieldCatalogDTO, CustomFieldDTO } from "@/actions/custom-field";
import { cleanActionConfig, isWorkflowActionType } from "@/lib/workflow/actions";
import type { WorkflowActionDef, WorkflowHook } from "@/lib/workflow/types";
import { DEFAULT_BOARD_COLOR } from "@/lib/board-palette";

export function DealSettingsClient({
  initial,
  catalogs,
  users,
  initialFlowId,
  basePath = "/dashboard/deals/settings",
}: {
  initial: WorkflowSettingsDTO;
  catalogs: Record<string, CustomFieldCatalogDTO>;
  users: WorkflowUserOption[];
  initialFlowId?: string;
  basePath?: string;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [committed, setCommitted] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [flowId, setFlowId] = useState(
    initial.workflows.some((w) => w.id === initialFlowId)
      ? initialFlowId!
      : (initial.workflows[0]?.id ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startPending] = useTransition();
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState("");

  const flow = settings.workflows.find((f) => f.id === flowId) ?? settings.workflows[0];
  const statuses = useMemo(
    () => settings.statuses.filter((s) => s.workflowId === flow?.id),
    [settings.statuses, flow?.id],
  );
  const transitions = useMemo(
    () => settings.transitions.filter((t) => t.workflowId === flow?.id),
    [settings.transitions, flow?.id],
  );
  const catalog =
    (flow?.layoutId ? catalogs?.[flow.layoutId] : undefined) ?? {
      layoutId: null,
      sections: [],
      unsectioned: [],
    };
  const fields: CustomFieldDTO[] = [
    ...catalog.unsectioned,
    ...catalog.sections.flatMap((s) => s.fields),
  ];

  const selectedStatus =
    statuses.find((s) => s.id === selectedStatusId) ?? null;
  const outgoing = selectedStatus
    ? transitions
        .filter((t) => t.fromStatusId === selectedStatus.id)
        .map((transition) => ({
          transition,
          toName:
            statuses.find((s) => s.id === transition.toStatusId)?.name ??
            "Unknown",
        }))
    : [];

  useEffect(() => {
    if (!dirty) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(next: (prev: WorkflowSettingsDTO) => WorkflowSettingsDTO) {
    setSettings((prev) => next(prev));
    setDirty(true);
    setError(null);
  }

  function addStatus() {
    if (!flow) return;
    const name = nextStatusName(
      newStatus.trim(),
      statuses.map((s) => s.name),
    );
    setNewStatus("");
    const created: WorkflowStatusDTO = {
      id: draftId("status"),
      workflowId: flow.id,
      name,
      color: DEFAULT_BOARD_COLOR,
      kind: "open",
      position: Date.now(),
      canvasX: statuses.length * 280,
      canvasY: 80,
      actions: [],
    };
    edit((prev) => ({
      ...prev,
      statuses: [...prev.statuses, created],
      workflows: prev.workflows.map((w) =>
        w.id === flow.id ? { ...w, statusCount: w.statusCount + 1 } : w,
      ),
    }));
    setSelectedStatusId(created.id);
  }

  function discard() {
    if (
      dirty &&
      !confirm("Discard this draft? Unsaved blueprint changes will be lost.")
    ) {
      return;
    }
    setSettings(committed);
    setDirty(false);
    setError(null);
    setSelectedStatusId(null);
  }

  function save() {
    if (!flow || !dirty) return;
    const workflowIds = new Set<string>([
      flow.id,
      ...settings.statuses.map((s) => s.workflowId),
      ...settings.transitions.map((t) => t.workflowId),
    ]);
    startPending(async () => {
      let next = settings;
      const mergedMap: Record<string, string> = {};
      for (const id of workflowIds) {
        const result = await saveWorkflowBlueprint(id, {
          statuses: next.statuses.filter((s) => s.workflowId === id),
          transitions: next.transitions.filter((t) => t.workflowId === id),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        Object.assign(mergedMap, result.data.idMap);
        next = {
          ...next,
          statuses: [
            ...next.statuses.filter((s) => s.workflowId !== id),
            ...result.data.statuses,
          ],
          transitions: [
            ...next.transitions.filter((t) => t.workflowId !== id),
            ...result.data.transitions,
          ],
          workflows: next.workflows.map((w) =>
            w.id === id
              ? { ...w, statusCount: result.data.statuses.length }
              : w,
          ),
        };
      }
      setSettings(next);
      setCommitted(next);
      setDirty(false);
      setError(null);
      setSelectedStatusId((current) =>
        current ? (mergedMap[current] ?? current) : null,
      );
      router.refresh();
    });
  }

  function leave() {
    if (
      dirty &&
      !confirm("This blueprint is still a draft. Leave without saving?")
    ) {
      return;
    }
    router.push(basePath);
  }

  if (!flow) {
    return (
      <div>
        <PageHeader>
          <PageBackButton href={basePath} label="Back to task flow settings" />
          <PageName>Blueprint</PageName>
        </PageHeader>
        <p className="px-app py-8 text-s text-muted-foreground">
          No flows yet.{" "}
          <Link
            href={`${basePath}/flows`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Create a task flow
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader>
        <PageBackButton onClick={leave} label="Back to task flow settings" />
        <Input
          key={flow.id + flow.name}
          defaultValue={flow.name}
          aria-label="Blueprint name"
          className="page-name h-7 max-w-72 border-transparent bg-transparent px-1.5"
          disabled={pending}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (!name || name === flow.name) return;
            startPending(async () => {
              const result = await updateWorkflow(flow.id, { name });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              const next = result.data;
              setError(null);
              function applyName(prev: WorkflowSettingsDTO): WorkflowSettingsDTO {
                return {
                  ...prev,
                  workflows: prev.workflows.map((item) =>
                    item.id === next.id
                      ? { ...item, name: next.name, updatedAt: next.updatedAt }
                      : item,
                  ),
                };
              }
              setSettings(applyName);
              setCommitted(applyName);
              router.refresh();
            });
          }}
        />
        {dirty && (
          <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
            Draft
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || pending}
            onClick={discard}
          >
            Discard
          </Button>
          <Button type="button" disabled={!dirty || pending} onClick={save}>
            Save
          </Button>
        </div>
      </PageHeader>

      <PageBody className="space-y-6 py-6">
        {error && <p className="text-s text-destructive">{error}</p>}
        {flow.blueprintEnabled === false && (
          <p className="text-s text-muted-foreground">
            This blueprint is off. Deals can move to any status. Turn it on from
            task flow settings to enforce the process again.
          </p>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {settings.workflows.length > 1 && (
                  <select
                    value={flow.id}
                    onChange={(e) => {
                      setFlowId(e.target.value);
                      setSelectedStatusId(null);
                    }}
                    className="flex h-8 shrink-0 rounded-md border border-input bg-transparent px-3 text-s"
                  >
                    {settings.workflows.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}
                <Input
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  placeholder="Status name"
                  className="w-56 shrink-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addStatus();
                    }
                  }}
                />
                <Button type="button" disabled={pending} onClick={addStatus}>
                  <Plus className="me-1.5 h-3.5 w-3.5" />
                  Add status
                </Button>
              </div>
              <BlueprintCanvas
                statuses={statuses}
                transitions={transitions}
                selectedStatusId={selectedStatusId}
                onSelectStatus={setSelectedStatusId}
                onMoveStatus={(id, x, y) =>
                  edit((prev) => ({
                    ...prev,
                    statuses: prev.statuses.map((s) =>
                      s.id === id ? { ...s, canvasX: x, canvasY: y } : s,
                    ),
                  }))
                }
                onConnectStatuses={(fromId, toId, sourceHandle, targetHandle) => {
                  const existing = transitions.find(
                    (t) => t.fromStatusId === fromId && t.toStatusId === toId,
                  );
                  const dest = statuses.find((s) => s.id === toId);
                  const canvasX = encodeHandle(sourceHandle);
                  const canvasY = encodeHandle(targetHandle);
                  if (existing) {
                    edit((prev) => ({
                      ...prev,
                      transitions: prev.transitions.map((t) =>
                        t.id === existing.id ? { ...t, canvasX, canvasY } : t,
                      ),
                    }));
                    setSelectedStatusId(fromId);
                    return;
                  }
                  edit((prev) => ({
                    ...prev,
                    transitions: [
                      ...prev.transitions,
                      {
                        id: draftId("transition"),
                        workflowId: flow.id,
                        name: dest ? `To ${dest.name}` : "Move",
                        fromStatusId: fromId,
                        toStatusId: toId,
                        canvasX,
                        canvasY,
                        actions: [],
                      },
                    ],
                  }));
                  setSelectedStatusId(fromId);
                }}
                onReconnectTransition={(
                  transitionId,
                  fromId,
                  toId,
                  sourceHandle,
                  targetHandle,
                ) => {
                  const already = transitions.some(
                    (t) =>
                      t.id !== transitionId &&
                      t.fromStatusId === fromId &&
                      t.toStatusId === toId,
                  );
                  if (already) return;
                  const dest = statuses.find((s) => s.id === toId);
                  edit((prev) => ({
                    ...prev,
                    transitions: prev.transitions.map((t) =>
                      t.id === transitionId
                        ? {
                            ...t,
                            fromStatusId: fromId,
                            toStatusId: toId,
                            name: dest ? `To ${dest.name}` : "Move",
                            canvasX: encodeHandle(sourceHandle),
                            canvasY: encodeHandle(targetHandle),
                          }
                        : t,
                    ),
                  }));
                  setSelectedStatusId(fromId);
                }}
              />
            </div>
            <div className="rounded-xl border border-border bg-card/40">
              <ActionInspector
                status={selectedStatus}
                outgoing={outgoing}
                fields={fields}
                users={users}
                onUpdateStatus={(id, input) =>
                  edit((prev) => ({
                    ...prev,
                    statuses: prev.statuses.map((s) =>
                      s.id === id ? { ...s, ...input } : s,
                    ),
                  }))
                }
                onDeleteStatus={(id) => {
                  edit((prev) => ({
                    ...prev,
                    statuses: prev.statuses.filter((s) => s.id !== id),
                    transitions: prev.transitions.filter(
                      (t) => t.fromStatusId !== id && t.toStatusId !== id,
                    ),
                    workflows: prev.workflows.map((w) =>
                      w.id === flow.id
                        ? { ...w, statusCount: Math.max(0, w.statusCount - 1) }
                        : w,
                    ),
                  }));
                  setSelectedStatusId(null);
                }}
                onDeleteTransition={(id) =>
                  edit((prev) => ({
                    ...prev,
                    transitions: prev.transitions.filter((t) => t.id !== id),
                  }))
                }
                onAddAction={(input) => {
                  if (!isWorkflowActionType(input.type)) return;
                  const action: WorkflowActionDef = {
                    id: draftId("action"),
                    hook: input.hook,
                    type: input.type,
                    config: cleanActionConfig(input.type, {}),
                    position: Date.now(),
                  };
                  edit((prev) => attachAction(prev, action, input));
                }}
                onUpdateAction={(id, input) =>
                  edit((prev) =>
                    replaceAction(prev, id, {
                      config: input.config,
                      hook: input.hook as WorkflowHook | undefined,
                    }),
                  )
                }
                onDeleteAction={(id) => edit((prev) => dropAction(prev, id))}
              />
            </div>
          </div>
      </PageBody>
    </div>
  );
}

function draftId(kind: string): string {
  return `draft:${kind}:${crypto.randomUUID()}`;
}

function nextStatusName(typed: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (typed && !taken.has(typed.toLowerCase())) return typed;
  const base = typed || "New status";
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

function attachAction(
  prev: WorkflowSettingsDTO,
  action: WorkflowActionDef,
  input: { statusId?: string; transitionId?: string },
): WorkflowSettingsDTO {
  if (input.statusId) {
    return {
      ...prev,
      statuses: prev.statuses.map((s) =>
        s.id === input.statusId ? { ...s, actions: [...s.actions, action] } : s,
      ),
    };
  }
  return {
    ...prev,
    transitions: prev.transitions.map((t) =>
      t.id === input.transitionId ? { ...t, actions: [...t.actions, action] } : t,
    ),
  };
}

function replaceAction(
  prev: WorkflowSettingsDTO,
  id: string,
  input: { config?: unknown; hook?: WorkflowHook },
): WorkflowSettingsDTO {
  const patch = (action: WorkflowActionDef): WorkflowActionDef => {
    if (action.id !== id) return action;
    const config =
      input.config !== undefined
        ? cleanActionConfig(action.type, input.config)
        : action.config;
    return {
      ...action,
      hook: input.hook ?? action.hook,
      config,
    };
  };
  return {
    ...prev,
    statuses: prev.statuses.map((s) => ({
      ...s,
      actions: s.actions.map(patch),
    })),
    transitions: prev.transitions.map((t) => ({
      ...t,
      actions: t.actions.map(patch),
    })),
  };
}

function dropAction(prev: WorkflowSettingsDTO, id: string): WorkflowSettingsDTO {
  return {
    ...prev,
    statuses: prev.statuses.map((s) => ({
      ...s,
      actions: s.actions.filter((a) => a.id !== id),
    })),
    transitions: prev.transitions.map((t) => ({
      ...t,
      actions: t.actions.filter((a) => a.id !== id),
    })),
  };
}
