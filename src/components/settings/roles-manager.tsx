"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddButton } from "@/components/add-button";
import {
  Trash2,
  Shield,
  Pencil,
  Check,
  X,
  Users,
  Crown,
  MessageCircle,
} from "lucide-react";
import { createRole, updateRole, deleteRole } from "@/actions/role";
import { cn } from "@/lib/utils";

// Only the stages a person moves a task through. Planned, Next, Completed and
// Shipped follow the sprint, so a role has nothing to permit there.
const ALL_STAGES = [
  { id: "BACKLOG", label: "Backlog" },
  { id: "TODO", label: "Todo" },
  { id: "IN_DEVELOPMENT", label: "In Development" },
  { id: "INTERNAL_REVIEW", label: "Internal Review" },
  { id: "DONE", label: "Done" },
];

interface WorkspaceRole {
  id: string;
  name: string;
  isAdmin: boolean;
  isClient: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  isTeamLead: boolean;
  canCreateSprintPlanning: boolean;
  canStartSprint: boolean;
  canEndSprint: boolean;
  canDeleteSprint: boolean;
  canViewTaskHistory: boolean;
  allowedStages: string | null;
  allowedTransitions: string | null;
  _count: { members: number };
}

interface Props {
  roles: WorkspaceRole[];
}

interface StagePerms {
  transitions: Record<string, string[]>;
  createStages: string[];
  modifyStages: string[];
}

function parseAllData(raw: string | null): StagePerms {
  if (!raw) return { transitions: {}, createStages: [], modifyStages: [] };
  try {
    const data = JSON.parse(raw);
    const createStages: string[] = data._create ?? [];
    const modifyStages: string[] = data._modify ?? [];
    const transitions: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(data)) {
      if (!key.startsWith("_")) transitions[key] = val as string[];
    }
    return { transitions, createStages, modifyStages };
  } catch {
    return { transitions: {}, createStages: [], modifyStages: [] };
  }
}

function serializeAllData(perms: StagePerms): Record<string, string[]> {
  const result: Record<string, string[]> = { ...perms.transitions };
  if (perms.createStages.length > 0) result._create = perms.createStages;
  if (perms.modifyStages.length > 0) result._modify = perms.modifyStages;
  return result;
}

function toggleInArray(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((s) => s !== item) : [...arr, item];
}

function toggleTransitionTarget(
  transitions: Record<string, string[]>,
  fromStage: string,
  toStage: string
): Record<string, string[]> {
  const current = transitions[fromStage] ?? [];
  const updated = current.includes(toStage)
    ? current.filter((s) => s !== toStage)
    : [...current, toStage];
  const result = { ...transitions };
  if (updated.length === 0) {
    delete result[fromStage];
  } else {
    result[fromStage] = updated;
  }
  return result;
}

function stageLabel(id: string): string {
  return ALL_STAGES.find((s) => s.id === id)?.label ?? id;
}

const EMPTY_GENERAL = {
  isClient: false,
  canMoveTask: false,
  canDeleteTask: false,
  canDeclineTask: false,
  isTeamLead: false,
  canCreateSprintPlanning: false,
  canStartSprint: false,
  canEndSprint: false,
  canDeleteSprint: false,
  canViewTaskHistory: false,
};

export function RolesManager({ roles }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState({ ...EMPTY_GENERAL });
  const [newStagePerms, setNewStagePerms] = useState<StagePerms>({
    transitions: {},
    createStages: [],
    modifyStages: [],
  });
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPerms, setEditPerms] = useState({ ...EMPTY_GENERAL });
  const [editStagePerms, setEditStagePerms] = useState<StagePerms>({
    transitions: {},
    createStages: [],
    modifyStages: [],
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createRole({
        name: newName.trim(),
        isClient: newPerms.isClient,
        canCreateTask: newPerms.isClient ? false : newStagePerms.createStages.length > 0,
        canModifyTask: newPerms.isClient ? false : newStagePerms.modifyStages.length > 0,
        canMoveTask: newPerms.isClient
          ? false
          : newPerms.canMoveTask || Object.keys(newStagePerms.transitions).length > 0,
        canDeleteTask: newPerms.isClient ? false : newPerms.canDeleteTask,
        canDeclineTask: newPerms.isClient ? false : newPerms.canDeclineTask,
        isTeamLead: newPerms.isClient ? false : newPerms.isTeamLead,
        canCreateSprintPlanning: newPerms.isClient ? false : newPerms.canCreateSprintPlanning,
        canStartSprint: newPerms.isClient ? false : newPerms.canStartSprint,
        canEndSprint: newPerms.isClient ? false : newPerms.canEndSprint,
        canDeleteSprint: newPerms.isClient ? false : newPerms.canDeleteSprint,
        // Deliberately not forced false for client roles: the lifecycle view is
        // the one thing a client can be granted without touching code.
        canViewTaskHistory: newPerms.canViewTaskHistory,
        allowedTransitions: newPerms.isClient ? {} : serializeAllData(newStagePerms),
      });
      setNewName("");
      setNewPerms({ ...EMPTY_GENERAL });
      setNewStagePerms({ transitions: {}, createStages: [], modifyStages: [] });
      setShowCreate(false);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(role: WorkspaceRole) {
    setEditingId(role.id);
    setEditName(role.name);
    setEditPerms({
      isClient: role.isClient,
      canMoveTask: role.canMoveTask,
      canDeleteTask: role.canDeleteTask,
      canDeclineTask: role.canDeclineTask,
      isTeamLead: role.isTeamLead,
      canCreateSprintPlanning: role.canCreateSprintPlanning,
      canStartSprint: role.canStartSprint,
      canEndSprint: role.canEndSprint,
      canDeleteSprint: role.canDeleteSprint,
      canViewTaskHistory: role.canViewTaskHistory,
    });
    const parsed = parseAllData(role.allowedTransitions);
    if (parsed.createStages.length === 0 && role.canCreateTask) {
      parsed.createStages = ALL_STAGES.map((s) => s.id);
    }
    if (parsed.modifyStages.length === 0 && role.canModifyTask) {
      parsed.modifyStages = ALL_STAGES.map((s) => s.id);
    }
    setEditStagePerms(parsed);
  }

  async function handleSave(roleId: string) {
    try {
      await updateRole({
        roleId,
        name: editName.trim() || undefined,
        isClient: editPerms.isClient,
        canCreateTask: editPerms.isClient ? false : editStagePerms.createStages.length > 0,
        canModifyTask: editPerms.isClient ? false : editStagePerms.modifyStages.length > 0,
        canMoveTask: editPerms.isClient
          ? false
          : editPerms.canMoveTask || Object.keys(editStagePerms.transitions).length > 0,
        canDeleteTask: editPerms.isClient ? false : editPerms.canDeleteTask,
        canDeclineTask: editPerms.isClient ? false : editPerms.canDeclineTask,
        isTeamLead: editPerms.isClient ? false : editPerms.isTeamLead,
        canCreateSprintPlanning: editPerms.isClient ? false : editPerms.canCreateSprintPlanning,
        canStartSprint: editPerms.isClient ? false : editPerms.canStartSprint,
        canEndSprint: editPerms.isClient ? false : editPerms.canEndSprint,
        canDeleteSprint: editPerms.isClient ? false : editPerms.canDeleteSprint,
        canViewTaskHistory: editPerms.canViewTaskHistory,
        allowedTransitions: editPerms.isClient ? {} : serializeAllData(editStagePerms),
      });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(roleId: string) {
    if (!confirm("Delete this role?")) return;
    try {
      const res = await deleteRole(roleId);
      if (res?.error) alert(res.error);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-s font-semibold text-foreground">Roles & Permissions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define roles with specific task permissions per stage.
          </p>
        </div>
        <AddButton
          label="New Role"
          onClick={() => setShowCreate((v) => !v)}
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-primary/30 bg-card p-4 mb-4 space-y-3"
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Role name (e.g. QA Lead, Designer)"
            className="h-8 text-s"
            autoFocus
          />

          <PermToggle
            label="Client — chat only"
            checked={newPerms.isClient}
            onChange={(v) =>
              setNewPerms((p) => ({
                ...EMPTY_GENERAL,
                isClient: v,
              }))
            }
          />
          <TaskHistoryToggle
            checked={newPerms.canViewTaskHistory}
            onChange={(v) => setNewPerms((p) => ({ ...p, canViewTaskHistory: v }))}
          />

          {newPerms.isClient ? (
            <p className="text-xs text-muted-foreground">
              This person only sees this project&apos;s client chat. No dashboard, projects, tasks, or internal chats.
            </p>
          ) : (
            <>
          <div className="flex flex-wrap gap-3">
            <PermToggle label="Delete tasks" checked={newPerms.canDeleteTask} onChange={(v) => setNewPerms((p) => ({ ...p, canDeleteTask: v }))} />
            <PermToggle label="Decline tasks" checked={newPerms.canDeclineTask} onChange={(v) => setNewPerms((p) => ({ ...p, canDeclineTask: v }))} />
            <PermToggle label="Team Lead" checked={newPerms.isTeamLead} onChange={(v) => setNewPerms((p) => ({ ...p, isTeamLead: v }))} />
          </div>

          <SprintPermToggles
            perms={newPerms}
            onChange={(patch) => setNewPerms((p) => ({ ...p, ...patch }))}
          />

          <StagePermissionsTable
            stagePerms={newStagePerms}
            onChange={setNewStagePerms}
            canMoveTask={newPerms.canMoveTask}
            onMoveTaskChange={(v) => setNewPerms((p) => ({ ...p, canMoveTask: v }))}
          />
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating || !newName.trim()}>
              {creating ? "Creating..." : "Create Role"}
            </Button>
          </div>
        </form>
      )}

      {/* Existing roles */}
      {roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-8 rounded-lg border border-border bg-card">
          <Shield className="w-8 h-8 text-muted-foreground opacity-50" strokeWidth={1.5} />
          <p className="text-s text-muted-foreground">No roles defined yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const isEditing = editingId === role.id;
            const parsed = parseAllData(role.allowedTransitions);

            return (
              <div
                key={role.id}
                className="rounded-lg border border-border bg-card p-4 hover:border-muted-foreground/20 transition-colors"
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 text-s"
                      autoFocus
                    />

                    {!role.isAdmin && (
                      <PermToggle
                        label="Client — chat only"
                        checked={editPerms.isClient}
                        onChange={(v) =>
                          setEditPerms((p) => ({
                            ...EMPTY_GENERAL,
                            isClient: v,
                          }))
                        }
                      />
                    )}
                    <TaskHistoryToggle
                      checked={editPerms.canViewTaskHistory}
                      onChange={(v) => setEditPerms((p) => ({ ...p, canViewTaskHistory: v }))}
                    />

                    {editPerms.isClient ? (
                      <p className="text-xs text-muted-foreground">
                        This person only sees this project&apos;s client chat. No dashboard, projects, tasks, or internal chats.
                      </p>
                    ) : (
                      <>
                    <div className="flex flex-wrap gap-3">
                      <PermToggle label="Delete tasks" checked={editPerms.canDeleteTask} onChange={(v) => setEditPerms((p) => ({ ...p, canDeleteTask: v }))} />
                      <PermToggle label="Decline tasks" checked={editPerms.canDeclineTask} onChange={(v) => setEditPerms((p) => ({ ...p, canDeclineTask: v }))} />
                      <PermToggle label="Team Lead" checked={editPerms.isTeamLead} onChange={(v) => setEditPerms((p) => ({ ...p, isTeamLead: v }))} />
                    </div>

                    <SprintPermToggles
                      perms={editPerms}
                      onChange={(patch) => setEditPerms((p) => ({ ...p, ...patch }))}
                    />

                    <StagePermissionsTable
                      stagePerms={editStagePerms}
                      onChange={setEditStagePerms}
                      canMoveTask={editPerms.canMoveTask}
                      onMoveTaskChange={(v) => setEditPerms((p) => ({ ...p, canMoveTask: v }))}
                    />
                      </>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="w-3.5 h-3.5 me-1" /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleSave(role.id)}>
                        <Check className="w-3.5 h-3.5 me-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                        <span className="text-s font-medium">{role.name}</span>
                        {role.isTeamLead && (
                          <span className="text-xs bg-orange/15 text-orange border border-orange/30 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <Crown className="w-2.5 h-2.5" strokeWidth={2} />
                            Team Lead
                          </span>
                        )}
                        {role.isClient && (
                          <span className="text-xs bg-cyan/15 text-cyan border border-cyan/30 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <MessageCircle className="w-2.5 h-2.5" strokeWidth={2} />
                            Chat only
                          </span>
                        )}
                        {role.isAdmin && (
                          <span className="text-xs bg-purple/15 text-purple border border-purple/30 px-1.5 py-0.5 rounded-full font-medium">
                            Admin
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Users className="w-3 h-3" /> {role._count.members}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => startEdit(role)}
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </Button>
                        {!role.isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(role.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-xs mb-2">
                      <PermBadge label="Task history" enabled={role.canViewTaskHistory} />
                    </div>

                    {role.isClient ? (
                      <p className="text-xs text-muted-foreground">
                        Only this project&apos;s client chat. Nothing else.
                      </p>
                    ) : (
                      <>
                    {/* Permission badges */}
                    <div className="flex flex-wrap gap-xs mb-2">
                      <PermBadge label="Delete" enabled={role.canDeleteTask} />
                      <PermBadge label="Decline" enabled={role.canDeclineTask} />
                      <PermBadge label="Sprint plan" enabled={role.canCreateSprintPlanning} />
                      <PermBadge label="Start sprint" enabled={role.canStartSprint} />
                      <PermBadge label="End sprint" enabled={role.canEndSprint} />
                      <PermBadge label="Delete sprint" enabled={role.canDeleteSprint} />
                    </div>

                    {/* Stage summary */}
                    <RoleStageSummary parsed={parsed} canMoveTask={role.canMoveTask} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoleStageSummary({ parsed }: { parsed: StagePerms; canMoveTask?: boolean }) {
  const hasCreate = parsed.createStages.length > 0;
  const hasModify = parsed.modifyStages.length > 0;
  // Transitions imply move permission (same rule as getPermissionsFromRole),
  // so always show them.
  const hasTransitions = Object.keys(parsed.transitions).length > 0;

  if (!hasCreate && !hasModify && !hasTransitions) return null;

  return (
    <div className="space-y-1 mt-2">
      {hasCreate && (
        <div className="flex items-center gap-xs text-xs">
          <span className="text-muted-foreground shrink-0 w-12">Create:</span>
          <div className="flex flex-wrap gap-1">
            {parsed.createStages.map((s) => (
              <span key={s} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded">{stageLabel(s)}</span>
            ))}
          </div>
        </div>
      )}
      {hasModify && (
        <div className="flex items-center gap-xs text-xs">
          <span className="text-muted-foreground shrink-0 w-12">Modify:</span>
          <div className="flex flex-wrap gap-1">
            {parsed.modifyStages.map((s) => (
              <span key={s} className="bg-purple/10 text-purple px-1.5 py-0.5 rounded">{stageLabel(s)}</span>
            ))}
          </div>
        </div>
      )}
      {hasTransitions && (
        <div className="flex items-center gap-xs text-xs">
          <span className="text-muted-foreground shrink-0 w-12">Move:</span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(parsed.transitions).map(([from, targets]) =>
              (targets as string[]).map((to) => {
                const fromIdx = ALL_STAGES.findIndex((s) => s.id === from);
                const toIdx = ALL_STAGES.findIndex((s) => s.id === to);
                const isForward = toIdx > fromIdx;
                return (
                  <span
                    key={`${from}-${to}`}
                    className={cn(
                      "px-1.5 py-0.5 rounded",
                      isForward ? "bg-success/10 text-success" : "bg-orange/10 text-orange"
                    )}
                  >
                    {stageLabel(from)} {isForward ? "→" : "←"} {stageLabel(to)}
                  </span>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StagePermissionsTable({
  stagePerms,
  onChange,
  canMoveTask,
  onMoveTaskChange,
}: {
  stagePerms: StagePerms;
  onChange: (p: StagePerms) => void;
  canMoveTask: boolean;
  onMoveTaskChange: (v: boolean) => void;
}) {
  function toggleCreate(stageId: string) {
    onChange({ ...stagePerms, createStages: toggleInArray(stagePerms.createStages, stageId) });
  }
  function toggleModify(stageId: string) {
    onChange({ ...stagePerms, modifyStages: toggleInArray(stagePerms.modifyStages, stageId) });
  }
  function toggleForward(fromId: string, toId: string) {
    const updated = toggleTransitionTarget(stagePerms.transitions, fromId, toId);
    onChange({ ...stagePerms, transitions: updated });
    if (!(stagePerms.transitions[fromId] ?? []).includes(toId) && !canMoveTask) {
      onMoveTaskChange(true);
    }
  }
  function toggleRollback(fromId: string, toId: string) {
    onChange({ ...stagePerms, transitions: toggleTransitionTarget(stagePerms.transitions, fromId, toId) });
    if (!(stagePerms.transitions[fromId] ?? []).includes(toId) && !canMoveTask) {
      onMoveTaskChange(true);
    }
  }

  const pipeline = ALL_STAGES.map((stage, i) => ({
    ...stage,
    next: ALL_STAGES[i + 1] ?? null,
    prev: ALL_STAGES[i - 1] ?? null,
  }));

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2 font-medium">Stage Permissions</p>
      <div className="app-card rounded-lg border border-border overflow-x-auto">
        <div className="grid grid-cols-[1fr_64px_64px_64px_64px] text-xs font-medium text-muted-foreground bg-muted/30 px-3 py-2 border-b border-border">
          <span>Stage</span>
          <span className="text-center">Create</span>
          <span className="text-center">Modify</span>
          <span className="text-center">Forward</span>
          <span className="text-center">Rollback</span>
        </div>
        {pipeline.map((stage) => {
          const createEnabled = stagePerms.createStages.includes(stage.id);
          const modifyEnabled = stagePerms.modifyStages.includes(stage.id);
          const forwardEnabled = stage.next ? (stagePerms.transitions[stage.id] ?? []).includes(stage.next.id) : false;
          const rollbackEnabled = stage.prev ? (stagePerms.transitions[stage.id] ?? []).includes(stage.prev.id) : false;

          return (
            <div
              key={stage.id}
              className="grid grid-cols-[1fr_64px_64px_64px_64px] items-center px-3 py-1.5 border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors"
            >
              <span className="text-xs font-medium text-foreground/80">{stage.label}</span>
              <div className="flex justify-center">
                <StageCheckbox enabled={createEnabled} onClick={() => toggleCreate(stage.id)} color="blue" />
              </div>
              <div className="flex justify-center">
                <StageCheckbox enabled={modifyEnabled} onClick={() => toggleModify(stage.id)} color="purple" />
              </div>
              <div className="flex justify-center">
                {stage.next ? (
                  <StageCheckbox enabled={forwardEnabled} onClick={() => toggleForward(stage.id, stage.next!.id)} color="emerald" />
                ) : (
                  <span className="text-xs text-muted-foreground/30">—</span>
                )}
              </div>
              <div className="flex justify-center">
                {stage.prev ? (
                  <StageCheckbox enabled={rollbackEnabled} onClick={() => toggleRollback(stage.id, stage.prev!.id)} color="amber" />
                ) : (
                  <span className="text-xs text-muted-foreground/30">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground/50 mt-1.5">
        Create = can create tasks in this stage. Modify = can edit tasks in this stage. Forward/Rollback = can move tasks to next/previous stage.
      </p>
    </div>
  );
}

function StageCheckbox({ enabled, onClick, color }: { enabled: boolean; onClick: () => void; color: string }) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    blue: { bg: "bg-primary/15", border: "border-primary/40", text: "text-primary" },
    purple: { bg: "bg-purple/15", border: "border-purple/40", text: "text-purple" },
    emerald: { bg: "bg-success/15", border: "border-success/40", text: "text-success" },
    amber: { bg: "bg-orange/15", border: "border-orange/40", text: "text-orange" },
  };
  const c = colorMap[color] ?? colorMap.blue;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-6 h-6 rounded-md border flex items-center justify-center transition-colors",
        enabled ? `${c.bg} ${c.border}` : "border-border hover:border-muted-foreground/40"
      )}
    >
      {enabled && <Check className={cn("w-3.5 h-3.5", c.text)} strokeWidth={2.5} />}
    </button>
  );
}

function TaskHistoryToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <PermToggle label="View task history" checked={checked} onChange={onChange} />
      <p className="text-xs text-muted-foreground">
        The stage-by-stage lifecycle of a task: who moved it, when, and how long it sat.
        Safe to grant to a client role.
      </p>
    </div>
  );
}

function SprintPermToggles({
  perms,
  onChange,
}: {
  perms: {
    canCreateSprintPlanning: boolean;
    canStartSprint: boolean;
    canEndSprint: boolean;
    canDeleteSprint: boolean;
  };
  onChange: (patch: Partial<typeof perms>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Sprint</p>
      <div className="flex flex-wrap gap-3">
        <PermToggle
          label="Create sprint planning"
          checked={perms.canCreateSprintPlanning}
          onChange={(v) => onChange({ canCreateSprintPlanning: v })}
        />
        <PermToggle
          label="Start sprint"
          checked={perms.canStartSprint}
          onChange={(v) => onChange({ canStartSprint: v })}
        />
        <PermToggle
          label="End sprint"
          checked={perms.canEndSprint}
          onChange={(v) => onChange({ canEndSprint: v })}
        />
        <PermToggle
          label="Delete sprint"
          checked={perms.canDeleteSprint}
          onChange={(v) => onChange({ canDeleteSprint: v })}
        />
      </div>
    </div>
  );
}

function PermToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center gap-xs rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
        checked
          ? "bg-primary/15 border-primary/40 text-primary"
          : "border-border text-muted-foreground hover:border-muted-foreground/40"
      )}
    >
      <div
        className={cn(
          "w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors",
          checked ? "bg-primary border-primary" : "border-muted-foreground/40"
        )}
      >
        {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={2.5} />}
      </div>
      {label}
    </button>
  );
}

function PermBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border",
        enabled
          ? "bg-success/15 text-success border-success/30"
          : "bg-muted text-muted-foreground/50 border-border line-through"
      )}
    >
      {label}
    </span>
  );
}
