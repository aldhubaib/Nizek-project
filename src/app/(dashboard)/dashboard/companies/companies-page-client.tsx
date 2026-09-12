"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ExternalLink, Pencil, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AddButton } from "@/components/add-button";
import { PageHeader, PageName } from "@/components/page-header";
import { CompanyEditorDialog } from "@/components/contacts/company-editor-dialog";
import { deleteCompany, type CompanyDTO } from "@/actions/company";
import { cn } from "@/lib/utils";

export function CompaniesPageClient({
  companies: initialCompanies,
}: {
  companies: CompanyDTO[];
}) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initialCompanies);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyDTO | null>(null);
  // Bumped on every open so the editor remounts with a clean form. Closing
  // leaves it alone, which keeps the dialog's exit animation.
  const [editorSession, setEditorSession] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.website ?? "").toLowerCase().includes(q) ||
        (c.notes ?? "").toLowerCase().includes(q),
    );
  }, [companies, query]);

  function openCreate() {
    setEditing(null);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  }

  function openEdit(company: CompanyDTO) {
    setEditing(company);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  }

  function applySaved(saved: CompanyDTO) {
    setCompanies((prev) => {
      const without = prev.filter((c) => c.id !== saved.id);
      return [...without, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    router.refresh();
  }

  async function remove(company: CompanyDTO) {
    const warning = company.contactCount
      ? ` Its ${company.contactCount} contact${company.contactCount === 1 ? "" : "s"} will stay in the directory without a company.`
      : "";
    if (!confirm(`Delete “${company.name}”?${warning}`)) return;

    setBusyId(company.id);
    try {
      const result = await deleteCompany(company.id);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setCompanies((prev) => prev.filter((c) => c.id !== company.id));
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Could not delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader className="justify-between">
        <PageName>Companies</PageName>
        <AddButton label="Add company" onClick={openCreate} />
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-4 px-app py-8">
        <p className="text-s text-muted-foreground">
          The organisations behind the{" "}
          <Link href="/dashboard/contacts" className="hover:text-foreground">
            contacts
          </Link>
          . Naming one here lets everyone at it point at the same record.
        </p>

        <div className="relative max-w-[16rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies"
            className="h-9 ps-8 text-s"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-s font-medium text-foreground">
              {companies.length === 0 ? "No companies yet" : "No matches"}
            </p>
            <p className="mt-1 text-s text-muted-foreground">
              {companies.length === 0
                ? "Add one here, or create it while adding a contact."
                : "Try a company name or website."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border bg-card">
            {filtered.map((company) => (
              <li
                key={company.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
                  busyId === company.id && "opacity-50",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                  <span className="text-s font-bold text-primary">
                    {company.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-s font-semibold">{company.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {company.contactCount} contact
                    {company.contactCount === 1 ? "" : "s"}
                  </p>
                </div>

                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer"
                    title={company.website}
                    className="hidden max-w-[12rem] items-center gap-1 truncate text-xs text-muted-foreground no-underline hover:text-primary sm:flex"
                  >
                    <span className="truncate">
                      {company.website.replace(/^https?:\/\//i, "")}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}

                <div className="flex shrink-0 items-center gap-0.5">
                  <IconBtn
                    title="Edit company"
                    onClick={() => openEdit(company)}
                    disabled={busyId === company.id}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn
                    title="Delete company"
                    onClick={() => remove(company)}
                    disabled={busyId === company.id}
                    danger
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CompanyEditorDialog
        key={editorSession}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={applySaved}
      />
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        danger && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}
