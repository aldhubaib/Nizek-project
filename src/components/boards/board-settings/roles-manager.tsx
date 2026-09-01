"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createBoardRole,
  deleteBoardRole,
  getBoardSettings,
  removeBoardMember,
  setBoardMemberRole,
  setDefaultBoardRole,
  updateBoardRole,
  type BoardRoleDTO,
  type BoardSettingsDTO,
} from "@/actions/board-role";
import { InlineName, ToggleRow } from "./settings-controls";
import type { BoardPermissions } from "@/lib/board-permissions";

interface Props {
  boardId: string;
  onError: (message: string) => void;
}

/**
 * Roles on this board, and who holds them.
 *
 * These are the board's own roles, unrelated to the project roles used by the
 * sprint side. Anyone on the project who has not been given one here falls back
 * to whichever role is marked the default.
 */

const PERMISSION_ROWS: {
  key: keyof BoardPermissions;
  label: string;
  hint?: string;
}[] = [
  { key: "canCreateCard", label: "Create cards" },
  { key: "canEditCard", label: "Edit cards", hint: "Title, description, fields and assignee." },
  { key: "canMoveCard", label: "Move cards", hint: "Between any two columns — a board has no fixed order." },
  { key: "canDeleteCard", label: "Archive cards" },
  { key: "canComment", label: "Comment on cards" },
  { key: "canManageColumns", label: "Manage columns" },
  { key: "canManageTypes", label: "Manage card types and fields" },
  { key: "canManageMembers", label: "Manage roles and members" },
];

export function RolesManager({ boardId, onError }: Props) {
  const [settings, setSettings] = useState<BoardSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const load = useCallback(async () => {
    const data = await getBoardSettings(boardId);
    setSettings(data);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<{ success: boolean; error?: string }>) => {
      setBusy(true);
      const result = await action();
      setBusy(false);
      if (!result.success) {
        onError(result.error ?? "Something went wrong.");
        return false;
      }
      await load();
      return true;
    },
    [load, onError],
  );

  if (loading) {
    return (
      <div className="grid place-items-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) {
    return (
      <p className="py-8 text-center text-s text-muted-foreground">
        You do not have permission to manage this board&apos;s roles.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h4 className="text-s font-medium text-muted-foreground">Roles</h4>

        {settings.roles.map((role) => (
          <RoleRow
            key={role.id}
            role={role}
            busy={busy}
            expanded={expandedRoleId === role.id}
            onToggle={() => setExpandedRoleId(expandedRoleId === role.id ? null : role.id)}
            run={run}
          />
        ))}

        {adding ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-field px-3 py-2">
            <input
              autoFocus
              value={newRoleName}
              onChange={(event) => setNewRoleName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setAdding(false);
              }}
              placeholder="Role name"
              className="min-w-0 flex-1 bg-transparent text-s outline-none"
            />
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!newRoleName.trim() || busy}
              onClick={async () => {
                const ok = await run(() =>
                  createBoardRole({
                    boardId,
                    name: newRoleName.trim(),
                    // A new role starts able to look and nothing else, so it is
                    // never accidentally more powerful than intended.
                    permissions: {},
                  }),
                );
                if (ok) {
                  setNewRoleName("");
                  setAdding(false);
                }
              }}
              className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2 text-s text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
          >
            <Plus className="size-4" />
            Add a role
          </button>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-s font-medium text-muted-foreground">Members</h4>

        {settings.members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-field px-3 py-2"
          >
            <Face name={member.name} imageUrl={member.imageUrl} />
            <span className="min-w-0 flex-1 truncate text-s">
              {member.name ?? member.email}
            </span>
            <select
              value={member.roleId}
              disabled={busy}
              onChange={(event) =>
                void run(() =>
                  setBoardMemberRole({
                    boardId,
                    userId: member.userId,
                    roleId: event.target.value,
                  }),
                )
              }
              className="h-8 shrink-0 rounded-md border border-border bg-background px-2 text-xs outline-none"
            >
              {settings.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => removeBoardMember({ boardId, userId: member.userId }))}
              aria-label={`Remove ${member.name ?? member.email}`}
              title="Drop back to the default role"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}

        {settings.candidates.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              On the project but not given a role here, so they hold{" "}
              <span className="text-foreground">
                {settings.roles.find((role) => role.isDefault)?.name ?? "the default"}
              </span>
              .
            </p>
            {settings.candidates.map((candidate) => (
              <div key={candidate.userId} className="flex items-center gap-2">
                <Face name={candidate.name} imageUrl={candidate.imageUrl} />
                <span className="min-w-0 flex-1 truncate text-s text-muted-foreground">
                  {candidate.name ?? candidate.email}
                </span>
                <select
                  defaultValue=""
                  disabled={busy}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    void run(() =>
                      setBoardMemberRole({
                        boardId,
                        userId: candidate.userId,
                        roleId: event.target.value,
                      }),
                    );
                  }}
                  className="h-8 shrink-0 rounded-md border border-border bg-background px-2 text-xs outline-none"
                >
                  <option value="">Give a role…</option>
                  {settings.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RoleRow({
  role,
  busy,
  expanded,
  onToggle,
  run,
}: {
  role: BoardRoleDTO;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  run: (action: () => Promise<{ success: boolean; error?: string }>) => Promise<boolean>;
}) {
  return (
    <div className="rounded-lg border border-border bg-field">
      <div className="flex items-center gap-2 px-3 py-2">
        {role.isAdmin && <ShieldCheck className="size-3.5 shrink-0 text-primary" />}
        <InlineName
          value={role.name}
          onSave={(next) => void run(() => updateBoardRole({ roleId: role.id, name: next }))}
          className="flex-1"
        />
        {role.isDefault && (
          <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Default
          </span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {role.memberCount} {role.memberCount === 1 ? "person" : "people"}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Done" : "Permissions"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => deleteBoardRole(role.id))}
          aria-label={`Delete ${role.name}`}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-0.5 border-t border-border/50 px-2 py-2">
          <ToggleRow
            label="Board admin"
            hint="Everything on this board, including these settings."
            checked={role.isAdmin}
            disabled={busy}
            onChange={(next) =>
              void run(() =>
                updateBoardRole({ roleId: role.id, permissions: { isAdmin: next } }),
              )
            }
          />

          <div className={cn("space-y-0.5", role.isAdmin && "opacity-50")}>
            {PERMISSION_ROWS.map((row) => (
              <ToggleRow
                key={row.key}
                label={row.label}
                hint={row.hint}
                checked={role.isAdmin || Boolean(role[row.key])}
                disabled={busy || role.isAdmin}
                onChange={(next) =>
                  void run(() =>
                    updateBoardRole({ roleId: role.id, permissions: { [row.key]: next } }),
                  )
                }
              />
            ))}
          </div>

          {!role.isDefault && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => setDefaultBoardRole(role.id))}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Make this the default for everyone on the project
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Face({ name, imageUrl }: { name: string | null; imageUrl: string | null }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imageUrl}
        alt=""
        className="size-6 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
      <UserRound className="size-3" />
    </span>
  );
}
