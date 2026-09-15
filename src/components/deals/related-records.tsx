"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  Contact,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CustomFieldDTO } from "@/actions/custom-field";
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
  const catalog = useMemo(
    () => options.filter((row) => row.id !== excludeId),
    [options, excludeId],
  );
  const modelLabel = RELATION_MODEL_LABEL[model];

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
  onChange,
}: {
  label: string;
  value?: RelatedRecordOption;
  options: RelatedRecordOption[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.subtitle.toLowerCase().includes(q),
    );
  }, [options, query]);

  function pick(id: string) {
    onChange(id);
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
      <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-64 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (filtered[0]) pick(filtered[0].id);
            }}
            placeholder={`Search ${label.toLowerCase()}s`}
            className="h-8 ps-8 text-s"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 && options.length === 0 ? (
            <p className="px-2 py-6 text-center text-s text-muted-foreground">
              No {label.toLowerCase()}s to pick
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-s text-muted-foreground">
              No matches for “{query.trim()}”
            </p>
          ) : (
            <ul>
              {!query.trim() && (
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
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
