"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  Shield,
  Pencil,
  Check,
  X,
  Users,
} from "lucide-react";
import { createRole, updateRole, deleteRole } from "@/actions/role";
import { cn } from "@/lib/utils";

const ALL_STAGES = [
  { id: "NEW_REQUEST", label: "New Request" },
  { id: "CLARIFICATION", label: "Clarification" },
  { id: "READY_FOR_DEV", label: "Ready for Dev" },
  { id: "IN_DEVELOPMENT", label: "In Development" },
  { id: "INTERNAL_REVIEW", label: "Internal Review" },
  { id: "CLIENT_REVIEW", label: "Client Review" },
  { id: "READY_FOR_RELEASE", label: "Ready for Release" },
  { id: "DONE", label: "Done" },
];

interface WorkspaceRole {
  id: string;
  name: string;
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  allowedStages: string | null;
  allowedTransitions: string | null;
  _count: { members: number };
}

interface Props {
  roles: WorkspaceRole[];
}

function parseTransitions(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
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

export function RolesManager({ roles }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState({
    canCreateTask: false,
    canModifyTask: false,
    canMoveTask: false,
    canDeleteTask: false,
    canDeclineTask: false,
  });
  const [newTransitions, setNewTransitions] = useState<Record<string, string[]>>({});
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPerms, setEditPerms] = useState({
    canCreateTask: false,
    canModifyTask: false,
    canMoveTask: false,
    canDeleteTask: false,
    canDeclineTask: false,
  });
  const [editTransitions, setEditTransitions] = useState<Record<string, string[]>>({});

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createRole({
        name: newName.trim(),
        canCreateTask: newPerms.canCreateTask,
        canModifyTask: newPerms.canModifyTask,
        canMoveTask: newPerms.canMoveTask,
        canDeleteTask: newPerms.canDeleteTask,
        canDeclineTask: newPerms.canDeclineTask,
        allowedTransitions: newTransitions,
      });
      setNewName("");
      setNewPerms({ canCreateTask: false, canModifyTask: false, canMoveTask: false, canDeleteTask: false, canDeclineTask: false });
      setNewTransitions({});
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
      canCreateTask: role.canCreateTask,
      canModifyTask: role.canModifyTask,
      canMoveTask: role.canMoveTask,
      canDeleteTask: role.canDeleteTask,
      canDeclineTask: role.canDeclineTask,
    });
    setEditTransitions(parseTransitions(role.allowedTransitions));
  }

  async function handleSave(roleId: string) {
    try {
      await updateRole({
        roleId,
        name: editName.trim() || undefined,
        canCreateTask: editPerms.canCreateTask,
        canModifyTask: editPerms.canModifyTask,
        canMoveTask: editPerms.canMoveTask,
        canDeleteTask: editPerms.canDeleteTask,
        canDeclineTask: editPerms.canDeclineTask,
        allowedTransitions: editTransitions,
      });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(roleId: string) {
    if (!confirm("Delete this role?")) return;
    try {
      await deleteRole(roleId);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Roles & Permissions</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Define roles with specific task permissions and stage transitions.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
          New Role
        </Button>
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
            className="h-8 text-[13px]"
            autoFocus
          />

          <div className="flex flex-wrap gap-3">
            <PermToggle label="Create tasks" checked={newPerms.canCreateTask} onChange={(v) => setNewPerms((p) => ({ ...p, canCreateTask: v }))} />
            <PermToggle label="Modify tasks" checked={newPerms.canModifyTask} onChange={(v) => setNewPerms((p) => ({ ...p, canModifyTask: v }))} />
            <PermToggle label="Move tasks" checked={newPerms.canMoveTask} onChange={(v) => setNewPerms((p) => ({ ...p, canMoveTask: v }))} />
            <PermToggle label="Delete tasks" checked={newPerms.canDeleteTask} onChange={(v) => setNewPerms((p) => ({ ...p, canDeleteTask: v }))} />
            <PermToggle label="Decline tasks" checked={newPerms.canDeclineTask} onChange={(v) => setNewPerms((p) => ({ ...p, canDeclineTask: v }))} />
          </div>

          {newPerms.canMoveTask && (
            <TransitionMatrix
              transitions={newTransitions}
              onChange={setNewTransitions}
            />
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
          <p className="text-[13px] text-muted-foreground">No roles defined yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const isEditing = editingId === role.id;
            const transitions = parseTransitions(role.allowedTransitions);

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
                      className="h-8 text-[13px]"
                      autoFocus
                    />

                    <div className="flex flex-wrap gap-3">
                      <PermToggle label="Create tasks" checked={editPerms.canCreateTask} onChange={(v) => setEditPerms((p) => ({ ...p, canCreateTask: v }))} />
                      <PermToggle label="Modify tasks" checked={editPerms.canModifyTask} onChange={(v) => setEditPerms((p) => ({ ...p, canModifyTask: v }))} />
                      <PermToggle label="Move tasks" checked={editPerms.canMoveTask} onChange={(v) => setEditPerms((p) => ({ ...p, canMoveTask: v }))} />
                      <PermToggle label="Delete tasks" checked={editPerms.canDeleteTask} onChange={(v) => setEditPerms((p) => ({ ...p, canDeleteTask: v }))} />
                      <PermToggle label="Decline tasks" checked={editPerms.canDeclineTask} onChange={(v) => setEditPerms((p) => ({ ...p, canDeclineTask: v }))} />
                    </div>

                    {editPerms.canMoveTask && (
                      <TransitionMatrix
                        transitions={editTransitions}
                        onChange={setEditTransitions}
                      />
                    )}

                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="w-3.5 h-3.5 mr-1" /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleSave(role.id)}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                        <span className="text-[13px] font-medium">{role.name}</span>
                        {role.isAdmin && (
                          <span className="text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded-full font-medium">
                            Admin
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
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

                    {/* Permission badges */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <PermBadge label="Create" enabled={role.canCreateTask} />
                      <PermBadge label="Modify" enabled={role.canModifyTask} />
                      <PermBadge label="Move" enabled={role.canMoveTask} />
                      <PermBadge label="Delete" enabled={role.canDeleteTask} />
                      <PermBadge label="Decline" enabled={role.canDeclineTask} />
                    </div>

                    {/* Allowed transitions summary */}
                    {role.canMoveTask && Object.keys(transitions).length > 0 && (
                      <div className="space-y-1 mt-2">
                        {Object.entries(transitions).map(([from, targets]) => (
                          <div key={from} className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-muted-foreground shrink-0">
                              {stageLabel(from)} &rarr;
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {(targets as string[]).map((to) => (
                                <span
                                  key={to}
                                  className="bg-primary/10 text-primary/80 px-1.5 py-0.5 rounded"
                                >
                                  {stageLabel(to)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
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

function TransitionMatrix({
  transitions,
  onChange,
}: {
  transitions: Record<string, string[]>;
  onChange: (t: Record<string, string[]>) => void;
}) {
  const sourceStages = ALL_STAGES.filter((s) => s.id !== "DONE");

  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-2 font-medium">Allowed Transitions</p>
      <div className="space-y-2">
        {sourceStages.map((from) => {
          const possibleTargets = ALL_STAGES.filter((s) => s.id !== from.id);
          const currentTargets = transitions[from.id] ?? [];

          return (
            <div key={from.id} className="flex items-start gap-2">
              <span className="text-[10px] text-muted-foreground mt-1 shrink-0 w-[100px] text-right">
                {from.label} &rarr;
              </span>
              <div className="flex flex-wrap gap-1">
                {possibleTargets.map((to) => (
                  <button
                    key={to.id}
                    type="button"
                    onClick={() =>
                      onChange(toggleTransitionTarget(transitions, from.id, to.id))
                    }
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[10px] transition-colors",
                      currentTargets.includes(to.id)
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "border-border text-muted-foreground/50 hover:border-muted-foreground/40"
                    )}
                  >
                    {to.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
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
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border",
        enabled
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-muted text-muted-foreground/50 border-border line-through"
      )}
    >
      {label}
    </span>
  );
}
