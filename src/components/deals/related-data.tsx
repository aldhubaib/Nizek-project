"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Contact, Plus, Search, X } from "lucide-react";
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
}: {
  label: string;
  empty: string;
  items: { id: string; title: string; subtitle: string }[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q),
    );
  }, [items, query]);

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
      <PopoverContent align="end" className="w-72 gap-2 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-8 ps-8 text-s"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-s text-muted-foreground">
              {items.length === 0 ? empty : `No matches for “${query.trim()}”`}
            </p>
          ) : (
            <ul>
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(item.id);
                      setOpen(false);
                      setQuery("");
                    }}
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
            </ul>
          )}
        </div>
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
