"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  Contact,
  Loader2,
  Plus,
  Search,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  AttachPicker,
  RelatedCard,
  UnlinkButton,
} from "@/components/deals/related-data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMBOBOX_COLLISION_AVOIDANCE,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CustomFieldDTO } from "@/actions/custom-field";
import { createRelatedRecord } from "@/actions/related-records";
import type { RelatedRecordOption } from "@/lib/fields/relations";
import {
  RELATION_MODEL_LABEL,
  parseRelationIds,
  stringifyRelationIds,
  type RelationModel,
} from "@/lib/fields/relations";
import { cn } from "@/lib/utils";

const MODEL_ICON: Record<RelationModel, LucideIcon> = {
  company: Building2,
  contact: Contact,
  deal: Briefcase,
  user: User,
};

export function RelatedField({
  field,
  value,
  options,
  excludeId,
  onChange,
}: {
  field: CustomFieldDTO;
  value: string;
  options: RelatedRecordOption[];
  excludeId?: string;
  onChange: (next: string) => void;
}) {
  const model = field.relation?.model ?? "company";
  const multiple = field.relation?.multiple ?? true;
  const attachedIds = parseRelationIds(value);
  const [created, setCreated] = useState<RelatedRecordOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const catalog = useMemo(() => {
    const seen = new Set<string>();
    const merged: RelatedRecordOption[] = [];
    for (const row of [...created, ...options]) {
      if (row.id === excludeId || seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    return merged;
  }, [created, options, excludeId]);
  const modelLabel = RELATION_MODEL_LABEL[model];
  const canCreate = model !== "user";

  async function createRecord(title: string): Promise<string | null> {
    if (!canCreate || creating) return null;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createRelatedRecord(model, title);
      if (!result.ok) {
        setCreateError(result.error);
        return null;
      }
      setCreated((prev) =>
        prev.some((row) => row.id === result.data.id)
          ? prev
          : [...prev, result.data],
      );
      return result.data.id;
    } finally {
      setCreating(false);
    }
  }

  if (!multiple) {
    const selectedId = attachedIds[0] ?? "";
    const selected =
      catalog.find((row) => row.id === selectedId) ??
      options.find((row) => row.id === selectedId);
    return (
      <div className="space-y-1.5">
        <Label className="text-s">
          {field.label}
          {field.required && <span className="ms-0.5 text-destructive">*</span>}
        </Label>
        <RelationSearchSelect
          label={modelLabel}
          value={selected}
          options={
            selected && !catalog.some((row) => row.id === selected.id)
              ? [selected, ...catalog]
              : catalog
          }
          canCreate={canCreate}
          creating={creating}
          createError={createError}
          onCreate={createRecord}
          onChange={(id) => onChange(stringifyRelationIds(id ? [id] : []))}
        />
      </div>
    );
  }

  const attached = attachedIds.map((id) => {
    const row = catalog.find((item) => item.id === id);
    return (
      row ?? {
        id,
        title: "No longer available",
        subtitle: "",
        href: "",
      }
    );
  });
  const attachedSet = new Set(attached.map((row) => row.id));
  const available = catalog.filter((row) => !attachedSet.has(row.id));
  const canAdd = multiple || attached.length === 0;

  return (
    <RelatedCard
      title={field.label}
      icon={MODEL_ICON[model]}
      empty={attached.length === 0}
      picker={
        canAdd ? (
          <AttachPicker
            label={`Add a ${modelLabel.toLowerCase()}`}
            empty={`No ${modelLabel.toLowerCase()}s left to add`}
            items={available.map((row) => ({
              id: row.id,
              title: row.title,
              subtitle: row.subtitle,
            }))}
            canCreate={canCreate}
            creating={creating}
            createError={createError}
            onCreate={async (title) => {
              const id = await createRecord(title);
              if (!id) return false;
              const next = multiple ? [...attachedIds, id] : [id];
              onChange(stringifyRelationIds(next));
              return true;
            }}
            onPick={(id) => {
              const next = multiple ? [...attachedIds, id] : [id];
              onChange(stringifyRelationIds(next));
            }}
          />
        ) : undefined
      }
    >
      <table className="w-full text-start">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Detail</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {attached.map((row) => (
            <tr key={row.id} className="border-t border-border/50">
              <td className="px-4 py-2.5">
                {row.href ? (
                  <Link
                    href={row.href}
                    className="text-s font-medium hover:underline"
                  >
                    {row.title}
                  </Link>
                ) : (
                  <span className="text-s font-medium">{row.title}</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-s text-muted-foreground">
                {row.subtitle || "—"}
              </td>
              <td className="px-2 py-2.5">
                <UnlinkButton
                  label={`Remove ${row.title}`}
                  onClick={() =>
                    onChange(
                      stringifyRelationIds(
                        attachedIds.filter((id) => id !== row.id),
                      ),
                    )
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RelatedCard>
  );
}

function RelationSearchSelect({
  label,
  value,
  options,
  canCreate,
  creating,
  createError,
  onCreate,
  onChange,
}: {
  label: string;
  value?: RelatedRecordOption;
  options: RelatedRecordOption[];
  canCreate: boolean;
  creating: boolean;
  createError: string | null;
  onCreate: (title: string) => Promise<string | null>;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.subtitle.toLowerCase().includes(q),
    );
  }, [options, query]);
  const typed = query.trim();
  const exact = typed
    ? options.some((row) => row.title.toLowerCase() === typed.toLowerCase())
    : false;
  const showCreate = canCreate && typed.length > 0 && !exact;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  async function createTyped() {
    if (!showCreate) return;
    const id = await onCreate(typed);
    if (id) pick(id);
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
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-start text-s dark:bg-input/30"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !value && "text-muted-foreground",
          )}
        >
          {value
            ? value.subtitle
              ? `${value.title} · ${value.subtitle}`
              : value.title
            : "—"}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionAvoidance={COMBOBOX_COLLISION_AVOIDANCE}
        className="flex w-[var(--anchor-width)] min-w-64 max-h-[min(20rem,var(--available-height))] flex-col overflow-hidden p-2"
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
              const exactRow = typed
                ? filtered.find(
                    (row) => row.title.toLowerCase() === typed.toLowerCase(),
                  )
                : undefined;
              if (exactRow) {
                pick(exactRow.id);
                return;
              }
              if (filtered[0]) {
                pick(filtered[0].id);
                return;
              }
              if (showCreate) void createTyped();
            }}
            placeholder={`Search ${label.toLowerCase()}s`}
            className="h-8 ps-8 text-s"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && !showCreate ? (
            <p className="px-2 py-6 text-center text-s text-muted-foreground">
              {options.length === 0
                ? canCreate
                  ? `Type a name to add a ${label.toLowerCase()}`
                  : `No ${label.toLowerCase()}s to pick`
                : `No matches for “${typed}”`}
            </p>
          ) : (
            <ul>
              {!typed && (
                <li>
                  <button
                    type="button"
                    onClick={() => pick("")}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-s text-muted-foreground hover:bg-accent/60",
                      !value && "bg-accent/40",
                    )}
                  >
                    <span className="min-w-0 flex-1">—</span>
                    {!value && <Check className="size-3.5 shrink-0" />}
                  </button>
                </li>
              )}
              {filtered.map((row) => {
                const on = value?.id === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => pick(row.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent/60",
                        on && "bg-accent/40",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-s font-medium">
                          {row.title}
                        </span>
                        {row.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.subtitle}
                          </span>
                        )}
                      </span>
                      {on && <Check className="size-3.5 shrink-0" />}
                    </button>
                  </li>
                );
              })}
              {showCreate && (
                <li>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => void createTyped()}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-s hover:bg-accent/60 disabled:opacity-50"
                  >
                    {creating ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin" />
                    ) : (
                      <Plus className="size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      Create “{typed}”
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
        {createError && (
          <p className="shrink-0 px-2 pt-1 text-xs text-destructive">
            {createError}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
