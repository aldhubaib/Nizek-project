"use client";

import * as React from "react";
import { format } from "date-fns";
import { FileText, Folder, KeyRound, Lock } from "lucide-react";

import { byNumber, byText, Chip, Collection, Fact, RecordRow, RecordRowSkeleton, useList, type Pill, type SortDef } from "@/next-ui/blocks";
import { useProjectVault, type VaultCredentialDTO } from "@/next-ui/data/vault";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { FilterBar } from "@/next-ui/patterns/filter-bar";

export const CATEGORY_LABEL: Record<string, string> = {
  LOGIN: "Login",
  EMAIL: "Email",
  API_KEY: "API key",
  OTHER: "Other",
};

const SORTS: SortDef<VaultCredentialDTO>[] = [
  { id: "title", label: "Title", compare: byText((c) => c.title) },
  { id: "updated", label: "Last changed", compare: byNumber((c) => new Date(c.updatedAt).getTime()) },
];

const searchText = (c: VaultCredentialDTO) => [c.title, c.username, c.url, c.folderName, c.category].filter(Boolean).join(" ");

/** The host of a URL ("app.example.com"), or the text as it is when it is not a URL. */
export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).host || url;
  } catch {
    return url;
  }
}

/**
 * The project's vault: each entry's title, user name, site and folder, with a lock where a
 * password is kept. Secrets never leave the server here; revealing, adding and editing are
 * not built here yet. A viewer without vault access for the
 * project is told so.
 */
export function VaultView({ projectId }: { projectId: string }) {
  const vault = useProjectVault(projectId);
  const [category, setCategory] = React.useState("all");
  const rows = vault.data;
  const categories = React.useMemo<Pill[]>(() => {
    const present = new Set((rows ?? []).map((c) => c.category ?? "OTHER"));
    return [{ id: "all", label: "All" }, ...Object.keys(CATEGORY_LABEL).filter((k) => present.has(k)).map((k) => ({ id: k, label: CATEGORY_LABEL[k] }))];
  }, [rows]);
  const scoped = React.useMemo(
    () => (category === "all" ? rows : rows?.filter((c) => (c.category ?? "OTHER") === category)),
    [rows, category],
  );
  const list = useList(scoped, { searchText, sorts: SORTS, defaultSort: "title" });
  const isFiltered = list.isFiltered || category !== "all";

  if (vault.error) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No access to this vault"
        description="Vault access is given per project, apart from team membership. Ask an admin to add you."
      />
    );
  }

  return (
    <div className="flex flex-col">
      <FilterBar
        search={list.query.search}
        onSearch={list.setSearch}
        placeholder="Search the vault…"
        sorts={SORTS}
        sort={list.query.sort ?? "title"}
        onSort={list.setSort}
        types={categories.length > 2 ? categories : undefined}
        type={category}
        onType={setCategory}
        typeLabel="Kind"
        isFiltered={isFiltered}
        onReset={() => {
          list.reset();
          setCategory("all");
        }}
      />
      <Collection
        layout="rows"
        items={list.rows}
        total={rows?.length}
        isFiltered={isFiltered}
        isPending={vault.isPending}
        error={null}
        noun={(rows?.length ?? 0) === 1 ? "entry" : "entries"}
        getKey={(c) => c.id}
        skeleton={<RecordRowSkeleton />}
        testId="vault-list"
        empty={{ icon: KeyRound, title: "Nothing in the vault yet", description: "Logins, mailboxes and API keys kept for this project appear here." }}
        render={(c) => <CredentialRow credential={c} />}
      />
    </div>
  );
}

function CredentialRow({ credential: c }: { credential: VaultCredentialDTO }) {
  const host = hostOf(c.url);
  return (
    <RecordRow
      leading={
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <KeyRound className="size-4" />
        </span>
      }
      title={c.title}
      description={[c.username, host].filter(Boolean).join(" · ") || undefined}
      meta={
        <>
          <Chip variant="secondary">{CATEGORY_LABEL[c.category ?? "OTHER"] ?? c.category}</Chip>
          {c.folderName && (
            <Fact title={c.folderName}>
              <Folder className="size-3.5" /> {c.folderName}
            </Fact>
          )}
          {c.hasPassword && (
            <Fact title="A password is kept">
              <Lock className="size-3.5" /> Password
            </Fact>
          )}
          {c.hasNotes && (
            <Fact title="Has notes">
              <FileText className="size-3.5" /> Notes
            </Fact>
          )}
          <Fact label="Changed">{format(new Date(c.updatedAt), "d MMM yyyy")}</Fact>
        </>
      }
    />
  );
}
