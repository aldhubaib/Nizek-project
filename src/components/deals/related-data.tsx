"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Contact, Loader2, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatPhone } from "@/lib/dial-codes";
import { industryLabel } from "@/lib/industries";
import { cn } from "@/lib/utils";
import type { ContactOption } from "@/actions/contact";
import type { CompanyOption } from "@/actions/company";
import type { DealCompanyDTO, DealContactDTO } from "@/actions/deal";

function dash(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

export function RelatedCompanies({
  attached,
  options,
  onAttach,
  onDetach,
}: {
  attached: DealCompanyDTO[];
  options: CompanyOption[];
  onAttach: (company: CompanyOption) => void;
  onDetach: (id: string) => void;
}) {
  const attachedIds = useMemo(
    () => new Set(attached.map((c) => c.id)),
    [attached],
  );
  const available = options.filter((c) => !attachedIds.has(c.id));

  return (
    <RelatedCard
      title="Company"
      icon={Building2}
      empty={attached.length === 0}
      picker={
        <AttachPicker
          label="Add a company"
          empty="No companies left to add"
          items={available.map((c) => ({
            id: c.id,
            title: c.name,
            subtitle: industryLabel(c.industry),
          }))}
          onPick={(id) => {
            const company = options.find((c) => c.id === id);
            if (company) onAttach(company);
          }}
        />
      }
    >
      <table className="w-full text-start">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Website</th>
            <th className="px-4 py-2 font-medium">Industry</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {attached.map((company) => (
            <tr key={company.id} className="border-t border-border/50">
              <td className="px-4 py-2.5">
                <Link
                  href={`/dashboard/companies/${company.id}`}
                  className="text-s font-medium hover:underline"
                >
                  {company.nameEn}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-s text-muted-foreground">
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground"
                  >
                    {company.website.replace(/^https?:\/\//i, "")}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2.5 text-s text-muted-foreground">
                {dash(industryLabel(company.industry))}
              </td>
              <td className="px-2 py-2.5">
                <UnlinkButton
                  label={`Remove ${company.nameEn}`}
                  onClick={() => onDetach(company.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RelatedCard>
  );
}

export function RelatedContacts({
  attached,
  options,
  onAttach,
  onDetach,
}: {
  attached: DealContactDTO[];
  options: ContactOption[];
  onAttach: (contact: ContactOption) => void;
  onDetach: (id: string) => void;
}) {
  const attachedIds = useMemo(
    () => new Set(attached.map((c) => c.id)),
    [attached],
  );
  const available = options.filter((c) => !attachedIds.has(c.id));

  return (
    <RelatedCard
      title="Contacts"
      icon={Contact}
      empty={attached.length === 0}
      picker={
        <AttachPicker
          label="Add a contact"
          empty="No contacts left to add"
          items={available.map((c) => ({
            id: c.id,
            title: `${c.firstName} ${c.lastName}`,
            subtitle: c.email ?? formatPhone(c.phoneCountry, c.phoneNumber),
          }))}
          onPick={(id) => {
            const contact = options.find((c) => c.id === id);
            if (contact) onAttach(contact);
          }}
        />
      }
    >
      <table className="w-full text-start">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Phone</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {attached.map((contact) => (
            <tr key={contact.id} className="border-t border-border/50">
              <td className="px-4 py-2.5">
                <Link
                  href={`/dashboard/contacts/${contact.id}`}
                  className="text-s font-medium hover:underline"
                >
                  {contact.firstName} {contact.lastName}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-s text-muted-foreground">
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="hover:text-foreground"
                  >
                    {contact.email}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-s tabular-nums text-muted-foreground">
                <a
                  href={`tel:${formatPhone(contact.phoneCountry, contact.phoneNumber).replace(/\s+/g, "")}`}
                  className="hover:text-foreground"
                >
                  {formatPhone(contact.phoneCountry, contact.phoneNumber)}
                </a>
              </td>
              <td className="px-2 py-2.5">
                <UnlinkButton
                  label={`Remove ${contact.firstName} ${contact.lastName}`}
                  onClick={() => onDetach(contact.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RelatedCard>
  );
}

export function RelatedCard({
  title,
  icon: Icon,
  empty,
  picker,
  children,
}: {
  title: string;
  icon: typeof Building2;
  empty: boolean;
  picker?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" />
          {title}
        </div>
        {picker}
      </div>
      {empty ? (
        <p className="border-t border-border/50 px-4 py-6 text-s text-muted-foreground">
          None yet.
        </p>
      ) : (
        children
      )}
    </div>
  );
}

export function AttachPicker({
  label,
  empty,
  items,
  onPick,
  canCreate = false,
  creating = false,
  createError = null,
  onCreate,
}: {
  label: string;
  empty: string;
  items: { id: string; title: string; subtitle: string }[];
  onPick: (id: string) => void;
  canCreate?: boolean;
  creating?: boolean;
  createError?: string | null;
  onCreate?: (title: string) => Promise<boolean | void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q),
    );
  }, [items, query]);
  const typed = query.trim();
  const exact = typed
    ? items.some((item) => item.title.toLowerCase() === typed.toLowerCase())
    : false;
  const showCreate = Boolean(canCreate && onCreate && typed && !exact);

  function pick(id: string) {
    onPick(id);
    setOpen(false);
    setQuery("");
  }

  async function createTyped() {
    if (!showCreate || !onCreate) return;
    const ok = await onCreate(typed);
    if (ok === false) return;
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
        aria-label={label}
        title={label}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <Plus className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 max-h-[min(20rem,var(--available-height))] flex-col overflow-hidden p-2">
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (showCreate) {
                void createTyped();
                return;
              }
              if (filtered[0]) pick(filtered[0].id);
            }}
            placeholder="Search"
            className="h-8 ps-8 text-s"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && !showCreate ? (
            <p className="px-2 py-6 text-center text-s text-muted-foreground">
              {items.length === 0
                ? canCreate
                  ? "Type a name to add one"
                  : empty
                : `No matches for “${typed}”`}
            </p>
          ) : (
            <ul>
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item.id)}
                    className={cn(
                      "flex w-full flex-col rounded-md px-2 py-1.5 text-start transition-colors hover:bg-accent/60",
                    )}
                  >
                    <span className="truncate text-s font-medium">
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    )}
                  </button>
                </li>
              ))}
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

export function UnlinkButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <X className="size-3.5" />
    </button>
  );
}
