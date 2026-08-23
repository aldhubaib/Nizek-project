"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clock, Search } from "lucide-react";
import { updateSprintPlanningTask } from "@/actions/sprint";
import { getProjectMembersForMention } from "@/actions/comment";
import { EmptyAssigneeIcon, formatMinutes } from "@/components/project/sprint-task-row";
import { useKanbanStore } from "@/store/kanban";
import { cn } from "@/lib/utils";
import type { SprintPlanningTask } from "@/lib/sprint-planning-doc";

type Assignee = NonNullable<SprintPlanningTask["assignee"]>;

function AssigneeAvatar({
  assignee,
  className,
}: {
  assignee: Assignee | null;
  className?: string;
}) {
  if (!assignee) {
    return <EmptyAssigneeIcon className={className} />;
  }
  if (assignee.imageUrl) {
    return (
      <img
        src={assignee.imageUrl}
        alt={assignee.name ?? ""}
        className={cn("block size-5 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  const initials = assignee.name?.split(" ").map((n) => n[0]).join("") ?? "?";
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground", className)}>
      {initials}
    </span>
  );
}

export function PlanningEstimateInput({
  taskId,
  minutes,
  disabled,
  onSaved,
}: {
  taskId: string;
  minutes: number | null;
  disabled?: boolean;
  onSaved: (minutes: number | null) => void;
}) {
  const updateStoreTask = useKanbanStore((s) => s.updateTask);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(minutes ? String(minutes) : "");
  const [local, setLocal] = useState(minutes);
  const saving = useRef(false);

  useEffect(() => {
    if (editing || saving.current) return;
    setLocal(minutes);
    setValue(minutes ? String(minutes) : "");
  }, [minutes, editing]);

  function startEdit(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    if (disabled) return;
    setValue(local ? String(local) : "");
    setEditing(true);
  }

  async function commit() {
    if (saving.current) return;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setEditing(false);
      setValue(local ? String(local) : "");
      return;
    }
    if (parsed === local) {
      setEditing(false);
      return;
    }
    const previous = local;
    saving.current = true;
    setLocal(parsed);
    setEditing(false);
    updateStoreTask(taskId, { estimatedMinutes: parsed });
    onSaved(parsed);
    try {
      await updateSprintPlanningTask({ taskId, estimatedMinutes: parsed });
    } catch {
      setLocal(previous);
      updateStoreTask(taskId, { estimatedMinutes: previous });
      onSaved(previous);
    } finally {
      saving.current = false;
    }
  }

  if (editing) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-success/40 bg-background px-2 py-1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Clock className="size-3.5 text-success" />
        <input
          type="number"
          min={1}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setValue(local ? String(local) : "");
            }
          }}
          className="w-12 bg-transparent text-xs font-semibold tabular-nums text-success outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-xs text-muted-foreground">min</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={startEdit}
      onPointerDown={(e) => e.stopPropagation()}
      title="Set estimate"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors",
        local
          ? "border-success/30 text-success hover:border-success/50"
          : "border-dashed border-muted-foreground/40 text-muted-foreground/50 hover:border-foreground/40 hover:text-muted-foreground",
        disabled && "cursor-default",
      )}
    >
      <Clock className="size-3.5" />
      {local ? formatMinutes(local) : "Est"}
    </button>
  );
}

export function PlanningAssigneePicker({
  projectId,
  taskId,
  assignee,
  disabled,
  onSaved,
}: {
  projectId: string;
  taskId: string;
  assignee: Assignee | null;
  disabled?: boolean;
  onSaved: (assignee: Assignee | null) => void;
}) {
  const updateStoreTask = useKanbanStore((s) => s.updateTask);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(false);
  const [local, setLocal] = useState(assignee);

  useEffect(() => {
    setLocal(assignee);
  }, [assignee]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getProjectMembersForMention(projectId)
      .then((res) => {
        if (!cancelled) setMembers(res.members);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const filtered = members.filter((member) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (member.name ?? "").toLowerCase().includes(q);
  });

  async function select(next: Assignee | null) {
    const previous = local;
    setLocal(next);
    setOpen(false);
    setQuery("");
    updateStoreTask(taskId, {
      assignee: next
        ? { id: next.id ?? "", name: next.name, imageUrl: next.imageUrl }
        : null,
    });
    onSaved(next);
    try {
      await updateSprintPlanningTask({ taskId, assigneeId: next?.id ?? null });
    } catch {
      setLocal(previous);
      updateStoreTask(taskId, {
        assignee: previous
          ? { id: previous.id ?? "", name: previous.name, imageUrl: previous.imageUrl }
          : null,
      });
      onSaved(previous);
    }
  }

  const rect = open ? buttonRef.current?.getBoundingClientRect() : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        title={local?.name ?? "Assign"}
        aria-label={local?.name ?? "Assign"}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-shadow",
          !disabled && "cursor-pointer hover:ring-2 hover:ring-primary/50",
        )}
      >
        <AssigneeAvatar assignee={local} />
      </button>
      {open && rect && createPortal(
        <>
          <div
            className="fixed inset-0 z-[300]"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          />
          <div
            className="fixed z-[301] w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
            style={{
              top: Math.min(rect.bottom + 8, window.innerHeight - 280),
              left: Math.max(8, rect.right - 256),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people"
                className="w-full bg-transparent text-s outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => void select(null)}
                className="flex w-full items-center gap-2 px-3 py-2 text-s text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <EmptyAssigneeIcon />
                <span className="flex-1 text-start">Unassigned</span>
                {!local && <Check className="size-3.5" />}
              </button>
              {loading ? (
                <p className="px-3 py-4 text-s text-muted-foreground">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-4 text-s text-muted-foreground">No people found</p>
              ) : (
                filtered.map((member) => {
                  const selected = local?.id === member.id || (!local?.id && local?.name === member.name);
                  return (
                    <button
                      key={member.id ?? member.name}
                      type="button"
                      onClick={() => void select(member)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-s hover:bg-accent"
                    >
                      <AssigneeAvatar assignee={member} />
                      <span className="min-w-0 flex-1 truncate text-start">{member.name ?? "Unknown"}</span>
                      {selected && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
