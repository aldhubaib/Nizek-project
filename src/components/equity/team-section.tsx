"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import { HolderAvatar } from "@/components/equity/holder-avatar";
import {
  RecordBadge,
  RecordDetail,
  RecordDetails,
  RecordRow,
  RowActions,
} from "@/components/equity/record-row";
import {
  addEquityTeamSnapshot,
  updateEquityTeamSnapshot,
  deleteEquityTeamSnapshot,
  type EquityHolderDTO,
  type EquityPortfolioDTO,
  type EquityRoleDTO,
} from "@/actions/equity";

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

const selectCls = cn(inputCls, "appearance-none pr-8");

const labelCls =
  "block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wide";

type Snapshot = EquityPortfolioDTO["teamSnapshots"][number];

/** One person mid-edit: who they are, and what they were on this team. */
type MemberDraft = {
  /** Survives reordering and name changes, which an index wouldn't. */
  key: string;
  holderId: string;
  roleId: string;
  body: string;
};

type TeamDraft = {
  effectiveOn: string;
  notes: string;
  members: MemberDraft[];
};

let memberSeq = 0;
function blankMember(): MemberDraft {
  memberSeq += 1;
  return { key: `member-${memberSeq}`, holderId: "", roleId: "", body: "" };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyTeam(): TeamDraft {
  return { effectiveOn: today(), notes: "", members: [blankMember()] };
}

/**
 * A new lineup starts from the one before it rather than from nothing: a team
 * changes by a person or two, and retyping the rest to record that is how
 * mistakes get in.
 */
function nextTeam(previous: Snapshot | undefined): TeamDraft {
  if (!previous) return emptyTeam();
  return {
    effectiveOn: today(),
    notes: "",
    members: previous.members.map((m) => ({
      ...blankMember(),
      holderId: m.holderId,
      roleId: m.roleId ?? "",
      body: m.body ?? "",
    })),
  };
}

function snapshotToDraft(snapshot: Snapshot): TeamDraft {
  return {
    effectiveOn: snapshot.effectiveOn.slice(0, 10),
    notes: snapshot.notes ?? "",
    members: snapshot.members.map((m) => ({
      ...blankMember(),
      holderId: m.holderId,
      roleId: m.roleId ?? "",
      body: m.body ?? "",
    })),
  };
}

function formatDay(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

/**
 * One lineup being written: the day it was true from, then a line per person.
 * Who they are comes from the shared names, so the photo and bio a deck shows
 * are written once rather than per project.
 */
function TeamForm({
  initial,
  holders,
  roles,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: TeamDraft;
  holders: EquityHolderDTO[];
  roles: EquityRoleDTO[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: TeamDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);

  const picked = draft.members.filter((m) => m.holderId);
  const duplicate =
    new Set(picked.map((m) => m.holderId)).size !== picked.length;

  function patchMember(key: string, patch: Partial<MemberDraft>) {
    setDraft((d) => ({
      ...d,
      members: d.members.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    }));
  }

  // The order rows sit in is the order the team reads in everywhere — the
  // saved lineup keeps it and the report renders it as entered.
  function moveMember(key: string, dir: -1 | 1) {
    setDraft((d) => {
      const from = d.members.findIndex((m) => m.key === key);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= d.members.length) return d;
      const members = [...d.members];
      const [row] = members.splice(from, 1);
      members.splice(to, 0, row);
      return { ...d, members };
    });
  }

  const blocked = !draft.effectiveOn
    ? "Pick the date this team was true from"
    : picked.length === 0
      ? "Add at least one person"
      : duplicate
        ? "Someone is on this team twice"
        : null;

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-4 mb-3">
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label className={labelCls}>As of</label>
          <input
            type="date"
            value={draft.effectiveOn}
            onChange={(e) =>
              setDraft((d) => ({ ...d, effectiveOn: e.target.value }))
            }
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Note (optional)</label>
          <input
            type="text"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="e.g. after the second founder joined"
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 px-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Name
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Role
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            What they bring
          </span>
          <span className="w-[5.25rem]" />
        </div>

        {draft.members.map((member, idx) => (
          <div
            key={member.key}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 items-center"
          >
            <select
              value={member.holderId}
              onChange={(e) =>
                patchMember(member.key, { holderId: e.target.value })
              }
              className={selectCls}
            >
              <option value="">Pick a name…</option>
              {holders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>

            <select
              value={member.roleId}
              onChange={(e) =>
                patchMember(member.key, { roleId: e.target.value })
              }
              className={selectCls}
            >
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={member.body}
              onChange={(e) => patchMember(member.key, { body: e.target.value })}
              placeholder="Leave blank to use their bio"
              className={inputCls}
            />

            <div className="flex items-center">
              <button
                type="button"
                onClick={() => moveMember(member.key, -1)}
                disabled={idx === 0}
                className="w-7 h-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveMember(member.key, 1)}
                disabled={idx === draft.members.length - 1}
                className="w-7 h-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    members:
                      d.members.length === 1
                        ? [blankMember()]
                        : d.members.filter((m) => m.key !== member.key),
                  }))
                }
                className="w-7 h-9 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Remove this person"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setDraft((d) => ({ ...d, members: [...d.members, blankMember()] }))
          }
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add person
        </button>
      </div>

      <div className="flex items-center justify-end gap-2">
        {blocked && (
          <span className="text-[11px] text-muted-foreground mr-auto">
            {blocked}
          </span>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="px-3 h-9 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={busy || blocked != null}
          className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Who is building the project, dated. The latest lineup is the team; the ones
 * before it are kept, so a deck from last quarter still says who made it.
 */
export function TeamSection({
  portfolio,
  holders,
  roles,
}: {
  portfolio: EquityPortfolioDTO;
  holders: EquityHolderDTO[];
  roles: EquityRoleDTO[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Newest first, as they arrive: the first is the team as it stands.
  const snapshots = portfolio.teamSnapshots;
  const current = snapshots[0];

  function payload(draft: TeamDraft) {
    return {
      effectiveOn: draft.effectiveOn,
      notes: draft.notes,
      members: draft.members
        .filter((m) => m.holderId)
        .map((m) => ({
          holderId: m.holderId,
          roleId: m.roleId || null,
          body: m.body,
        })),
    };
  }

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      alert((err as Error).message || failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      icon={Users}
      title="Team"
      summary={
        current
          ? `${current.members.length} ${
              current.members.length === 1 ? "person" : "people"
            }`
          : undefined
      }
      description="Who is building this, as of a date. A team changes, so each lineup is kept rather than overwritten — the latest is the team today."
      forceOpen={adding || editingId !== null}
      actions={
        !adding &&
        holders.length > 0 && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {current ? "New lineup" : "Add the team"}
          </button>
        )
      }
    >
      {holders.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-2">
          Nobody to pick from yet — add the people under{" "}
          <Link
            href="/dashboard/equity"
            className="text-primary hover:underline"
          >
            Names
          </Link>{" "}
          first, with their photo and bio.
        </p>
      ) : (
        <>
          {adding && (
            <TeamForm
              initial={nextTeam(current)}
              holders={holders}
              roles={roles}
              busy={busy}
              submitLabel="Save team"
              onCancel={() => setAdding(false)}
              onSubmit={(draft) =>
                run(async () => {
                  await addEquityTeamSnapshot(portfolio.id, payload(draft));
                  setAdding(false);
                }, "Failed to save the team")
              }
            />
          )}

          {snapshots.length === 0 && !adding && (
            <p className="text-[12px] text-muted-foreground py-2">
              No team recorded yet.
            </p>
          )}

          <div className="space-y-2">
            {snapshots.map((snapshot) =>
              editingId === snapshot.id ? (
                <TeamForm
                  key={snapshot.id}
                  initial={snapshotToDraft(snapshot)}
                  holders={holders}
                  roles={roles}
                  busy={busy}
                  submitLabel="Save team"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) =>
                    run(async () => {
                      await updateEquityTeamSnapshot(
                        snapshot.id,
                        payload(draft),
                      );
                      setEditingId(null);
                    }, "Failed to save the team")
                  }
                />
              ) : (
                <RecordRow
                  key={snapshot.id}
                  title={formatDay(snapshot.effectiveOn)}
                  badges={
                    snapshot.id === current?.id && (
                      <RecordBadge tone="info">The team today</RecordBadge>
                    )
                  }
                  meta={`${snapshot.members.length} ${
                    snapshot.members.length === 1 ? "person" : "people"
                  }`}
                  actions={
                    <RowActions
                      label="Team options"
                      disabled={busy}
                      onEdit={() => {
                        setEditingId(snapshot.id);
                        setAdding(false);
                      }}
                      onDelete={() =>
                        confirm("Delete this lineup?") &&
                        run(
                          () => deleteEquityTeamSnapshot(snapshot.id),
                          "Failed to delete the lineup",
                        )
                      }
                    />
                  }
                >
                  <RecordDetails>
                    {snapshot.members.map((member) => (
                      <RecordDetail
                        key={member.id}
                        label={member.role?.name || member.title || "On the team"}
                        value={
                          <span className="flex items-center gap-2 min-w-0">
                            <HolderAvatar
                              name={member.holder.name}
                              photoUrl={member.holder.photoUrl}
                              size={6}
                            />
                            <span className="truncate">
                              {member.holder.name}
                            </span>
                          </span>
                        }
                      />
                    ))}
                    {snapshot.notes && (
                      <RecordDetail
                        label="Note"
                        span
                        value={
                          <span className="whitespace-pre-wrap text-muted-foreground">
                            {snapshot.notes}
                          </span>
                        }
                      />
                    )}
                  </RecordDetails>
                </RecordRow>
              ),
            )}
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}
