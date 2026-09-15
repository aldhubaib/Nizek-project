"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  COMBOBOX_COLLISION_AVOIDANCE,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MemberAvatar } from "@/components/boards/member-avatar";
import type { WorkflowUserOption } from "@/actions/workflow";
import {
  parseUserIds,
  stringifyUserIds,
} from "@/lib/fields/user-config";
import { cn } from "@/lib/utils";

function resolveUser(
  id: string,
  users: WorkflowUserOption[],
): WorkflowUserOption {
  return (
    users.find((user) => user.id === id) ?? {
      id,
      name: "No longer available",
      email: "",
      imageUrl: null,
    }
  );
}

export function UserField({
  value,
  users,
  multiple,
  onChange,
}: {
  value: string;
  users: WorkflowUserOption[];
  multiple: boolean;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const ids = parseUserIds(value);
  const selectedIds = multiple ? ids : ids.slice(0, 1);
  const selectedSet = new Set(selectedIds);
  const selected = selectedIds.map((id) => resolveUser(id, users));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  function commit(next: string[]) {
    onChange(stringifyUserIds(multiple ? next : next.slice(0, 1), multiple));
  }

  function pick(id: string) {
    if (!id) {
      commit([]);
      setOpen(false);
      setQuery("");
      return;
    }
    if (multiple) {
      commit(
        selectedSet.has(id)
          ? selectedIds.filter((item) => item !== id)
          : [...selectedIds, id],
      );
      return;
    }
    commit([id]);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        type="button"
        className="flex min-h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-2 py-1.5 text-start dark:bg-input/30"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 ? (
            <span className="text-s text-muted-foreground">
              {multiple ? "Select people…" : "Select a person…"}
            </span>
          ) : multiple ? (
            selected.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
              >
                <MemberAvatar
                  person={{ name: user.name, imageUrl: user.imageUrl }}
                  size="xs"
                />
                {user.name}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    commit(selectedIds.filter((item) => item !== user.id));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    commit(selectedIds.filter((item) => item !== user.id));
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${user.name}`}
                >
                  <X className="size-2.5" />
                </span>
              </span>
            ))
          ) : (
            <span className="flex min-w-0 items-center gap-1.5 text-s">
              <MemberAvatar
                person={{
                  name: selected[0]?.name ?? null,
                  imageUrl: selected[0]?.imageUrl ?? null,
                }}
                size="xs"
              />
              <span className="truncate">{selected[0]?.name}</span>
            </span>
          )}
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionAvoidance={COMBOBOX_COLLISION_AVOIDANCE}
        className="flex w-80 max-h-[min(20rem,var(--available-height))] flex-col overflow-hidden p-2"
        initialFocus={() => {
          searchRef.current?.focus({ preventScroll: true });
          return false;
        }}
      >
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (filtered[0]) pick(filtered[0].id);
            }}
            placeholder="Search people"
            className="h-8 ps-8 text-s"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {users.length === 0 ? (
            <p className="px-2 py-6 text-center text-s text-muted-foreground">
              No people to pick
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-s text-muted-foreground">
              No matches for “{query.trim()}”
            </p>
          ) : (
            <ul>
              {!multiple && !query.trim() && (
                <li>
                  <button
                    type="button"
                    onClick={() => pick("")}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-s text-muted-foreground hover:bg-accent/60",
                      selectedIds.length === 0 && "bg-accent/40",
                    )}
                  >
                    <span className="min-w-0 flex-1">—</span>
                    {selectedIds.length === 0 && (
                      <Check className="size-3.5 shrink-0" />
                    )}
                  </button>
                </li>
              )}
              {filtered.map((user) => {
                const on = selectedSet.has(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => pick(user.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent/60",
                        on && "bg-accent/40",
                      )}
                    >
                      <MemberAvatar
                        person={{ name: user.name, imageUrl: user.imageUrl }}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-s">
                          {user.name}
                        </span>
                        {user.email && user.email !== user.name && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        )}
                      </span>
                      {on && (
                        <Check className="size-3.5 shrink-0 text-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
