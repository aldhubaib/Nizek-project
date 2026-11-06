"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { stageLabel } from "@/lib/task-label";
import { useCreateRole, useDeleteRole, useUpdateRole, type ProjectRole } from "@/next-ui/data/projects";
import { cn } from "@/next-ui/lib/cn";
import { ConfirmDialog, ErrorNote, errorText } from "@/next-ui/patterns/form-bits";
import { Button } from "@/next-ui/ui/button";
import { Checkbox } from "@/next-ui/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/next-ui/ui/dialog";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Switch } from "@/next-ui/ui/switch";

import { ALL_STAGE_IDS, EMPTY_STAGE_PERMS, hasTransitions, parseStagePerms, serializeStagePerms, stageGridRows, toggleModify, toggleTransition, type StagePerms } from "./role-perms";

/**
 * A project role, as the live panel's role manager has it: its name, the chat-only client
 * switch, the task rights (create, delete, decline, team lead, task history), the sprint
 * rights (plan, start, end, delete), and the stage grid — Modify per stage, Forward and
 * Rollback along the chain a card moves by hand. The same payload goes to the same action.
 */

interface Flags {
  isClient: boolean;
  canCreateTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  isTeamLead: boolean;
  canCreateSprintPlanning: boolean;
  canStartSprint: boolean;
  canEndSprint: boolean;
  canDeleteSprint: boolean;
  canViewTaskHistory: boolean;
}

const EMPTY_FLAGS: Flags = {
  isClient: false,
  canCreateTask: false,
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

function flagsOf(r: ProjectRole | null): Flags {
  if (!r) return EMPTY_FLAGS;
  return {
    isClient: r.isClient,
    canCreateTask: r.canCreateTask,
    canMoveTask: r.canMoveTask,
    canDeleteTask: r.canDeleteTask,
    canDeclineTask: r.canDeclineTask,
    isTeamLead: r.isTeamLead,
    canCreateSprintPlanning: r.canCreateSprintPlanning,
    canStartSprint: r.canStartSprint,
    canEndSprint: r.canEndSprint,
    canDeleteSprint: r.canDeleteSprint,
    canViewTaskHistory: r.canViewTaskHistory,
  };
}

function stagePermsOf(r: ProjectRole | null): StagePerms {
  if (!r) return EMPTY_STAGE_PERMS;
  const parsed = parseStagePerms(r.allowedTransitions);
  // a role saved before the grid existed: "may modify" meant every stage
  if (parsed.modifyStages.length === 0 && r.canModifyTask) return { ...parsed, modifyStages: [...ALL_STAGE_IDS] };
  return parsed;
}

export function RoleDialog({ projectId, role: r, open, onClose }: { projectId: string; role: ProjectRole | null; open: boolean; onClose: () => void }) {
  const create = useCreateRole(projectId);
  const update = useUpdateRole(projectId);
  const [name, setName] = React.useState("");
  const [flags, setFlags] = React.useState<Flags>(EMPTY_FLAGS);
  const [stages, setStages] = React.useState<StagePerms>(EMPTY_STAGE_PERMS);
  const [error, setError] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setName(r?.name ?? "");
      setFlags(flagsOf(r));
      setStages(stagePermsOf(r));
      setError(null);
    }
  }
  const editing = r != null;
  const admin = Boolean(r?.isAdmin);
  const busy = create.isPending || update.isPending;
  const canSave = name.trim() !== "" && !busy;
  const client = flags.isClient;

  const set = (patch: Partial<Flags>) => setFlags((f) => ({ ...f, ...patch }));
  const move = (next: StagePerms) => {
    // a Forward or Rollback box ticked is the move right, as on the live panel
    setStages(next);
    if (hasTransitions(next) && !flags.canMoveTask) set({ canMoveTask: true });
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    const payload = {
      name: name.trim(),
      isClient: client,
      canCreateTask: client ? false : flags.canCreateTask,
      canModifyTask: client ? false : stages.modifyStages.length > 0,
      canMoveTask: client ? false : flags.canMoveTask || hasTransitions(stages),
      canDeleteTask: client ? false : flags.canDeleteTask,
      canDeclineTask: client ? false : flags.canDeclineTask,
      isTeamLead: client ? false : flags.isTeamLead,
      canCreateSprintPlanning: client ? false : flags.canCreateSprintPlanning,
      canStartSprint: client ? false : flags.canStartSprint,
      canEndSprint: client ? false : flags.canEndSprint,
      canDeleteSprint: client ? false : flags.canDeleteSprint,
      // the one right a client role can be granted
      canViewTaskHistory: flags.canViewTaskHistory,
      allowedTransitions: client ? {} : serializeStagePerms(stages),
    };
    const fail = (err: unknown) => setError(errorText(err));
    if (editing) update.mutate({ roleId: r.id, ...payload }, { onSuccess: onClose, onError: fail });
    else create.mutate(payload, { onSuccess: onClose, onError: fail });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl" data-testid="role-dialog">
        <form onSubmit={save} className="contents">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit role` : "New role"}</DialogTitle>
            <DialogDescription>{admin ? "The Admin role may do everything; only its name changes." : "What people with this role may do on the project."}</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus data-testid="role-name" />
            </div>
            {!admin && (
              <>
                <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">Client — chat only</span>
                    <span className="text-xs text-muted-foreground">Sees the client chat and nothing else of the project.</span>
                  </span>
                  <Switch checked={client} onCheckedChange={(v) => set({ isClient: v })} data-testid="role-client" />
                </label>
                {!client && (
                  <>
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-2 text-xs font-medium text-muted-foreground">Tasks</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Flag label="Create tasks" checked={flags.canCreateTask} onChange={(v) => set({ canCreateTask: v })} />
                        <Flag label="Delete tasks" checked={flags.canDeleteTask} onChange={(v) => set({ canDeleteTask: v })} />
                        <Flag label="Decline tasks" hint="Send a task back from Internal review" checked={flags.canDeclineTask} onChange={(v) => set({ canDeclineTask: v })} />
                        <Flag label="Team lead" checked={flags.isTeamLead} onChange={(v) => set({ isTeamLead: v })} />
                      </div>
                    </fieldset>
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-2 text-xs font-medium text-muted-foreground">Sprints</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Flag label="Plan sprints" checked={flags.canCreateSprintPlanning} onChange={(v) => set({ canCreateSprintPlanning: v })} />
                        <Flag label="Start sprints" checked={flags.canStartSprint} onChange={(v) => set({ canStartSprint: v })} />
                        <Flag label="End sprints" checked={flags.canEndSprint} onChange={(v) => set({ canEndSprint: v })} />
                        <Flag label="Delete sprints" checked={flags.canDeleteSprint} onChange={(v) => set({ canDeleteSprint: v })} />
                      </div>
                    </fieldset>
                    <StageGrid perms={stages} onChange={move} />
                  </>
                )}
                <Flag label="See task history" hint="The lifecycle of each task, who moved it and when" checked={flags.canViewTaskHistory} onChange={(v) => set({ canViewTaskHistory: v })} />
              </>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSave} data-testid="role-save">
              {busy ? "Saving…" : editing ? "Save" : "Add role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Flag({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span className="flex flex-col">
        <span>{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/** Modify per stage; Forward and Rollback where the chain allows a move. */
function StageGrid({ perms, onChange }: { perms: StagePerms; onChange: (p: StagePerms) => void }) {
  const rows = stageGridRows();
  return (
    <fieldset className="flex flex-col gap-2" data-testid="stage-grid">
      <legend className="mb-2 text-xs font-medium text-muted-foreground">Stages</legend>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[1fr_repeat(3,4rem)] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Stage</span>
          <span className="text-center">Modify</span>
          <span className="text-center">Forward</span>
          <span className="text-center">Rollback</span>
        </div>
        {rows.map((row) => {
          const modify = perms.modifyStages.includes(row.id);
          const forward = row.next ? (perms.transitions[row.id] ?? []).includes(row.next) : false;
          const rollback = row.prev ? (perms.transitions[row.id] ?? []).includes(row.prev) : false;
          return (
            <div key={row.id} className="grid grid-cols-[1fr_repeat(3,4rem)] items-center border-b px-3 py-1.5 text-sm last:border-b-0">
              <span>{stageLabel(row.id)}</span>
              <Cell on={modify} label={`Modify tasks in ${stageLabel(row.id)}`} tone="violet" onClick={() => onChange(toggleModify(perms, row.id))} />
              {row.next ? <Cell on={forward} label={`${stageLabel(row.id)} → ${stageLabel(row.next)}`} tone="success" onClick={() => onChange(toggleTransition(perms, row.id, row.next!))} /> : <Dash />}
              {row.prev ? <Cell on={rollback} label={`${stageLabel(row.id)} → ${stageLabel(row.prev)}`} tone="orange" onClick={() => onChange(toggleTransition(perms, row.id, row.prev!))} /> : <Dash />}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Modify: may edit tasks sitting in this stage. Forward and Rollback: may move a task one step on or back from it.</p>
    </fieldset>
  );
}

function Cell({ on, label, tone, onClick }: { on: boolean; label: string; tone: "violet" | "success" | "orange"; onClick: () => void }) {
  const color = tone === "violet" ? "border-violet bg-violet text-white" : tone === "success" ? "border-success bg-success text-white" : "border-orange bg-orange text-white";
  return (
    <span className="flex justify-center">
      <button type="button" role="checkbox" aria-checked={on} aria-label={label} title={label} onClick={onClick} className={cn("grid size-5 place-items-center rounded border transition-colors", on ? color : "border-muted-foreground/40 hover:border-muted-foreground")}>
        {on && <Check className="size-3.5" strokeWidth={3} />}
      </button>
    </span>
  );
}

function Dash() {
  return <span className="text-center text-muted-foreground/50">—</span>;
}

/** The server refuses to delete the Admin role or one someone still holds; its words are shown. */
export function DeleteRoleDialog({ projectId, role: r, open, onClose }: { projectId: string; role: ProjectRole | null; open: boolean; onClose: () => void }) {
  const del = useDeleteRole(projectId);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Delete role"
      description={r ? `"${r.name}" is removed. A role someone still holds cannot be deleted; give them another role first.` : ""}
      confirmLabel="Delete role"
      busyLabel="Deleting…"
      destructive
      onConfirm={() => (r ? del.mutateAsync(r.id) : undefined)}
      testId="delete-role-dialog"
    />
  );
}
