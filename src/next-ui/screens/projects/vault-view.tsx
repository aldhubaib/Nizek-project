"use client";

import * as React from "react";
import { format } from "date-fns";
import { Code2, Eye, FileText, Folder, FolderCog, KeyRound, Lock, Mail, MoreHorizontal, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";

import {
  byNumber,
  byText,
  Chip,
  Collection,
  Fact,
  RecordCard,
  RecordCardSkeleton,
  RecordMenu,
  RecordRow,
  RecordRowSkeleton,
  useList,
  type SortDef,
} from "@/next-ui/blocks";
import { useProjectVault, type VaultCredentialDTO } from "@/next-ui/data/vault";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { filterGroup, optionsOf, usePageFilters } from "@/next-ui/patterns/filter-menu";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { ListTools } from "@/next-ui/patterns/list-tools";
import { usePageView } from "@/next-ui/patterns/view-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/next-ui/ui/dropdown-menu";

import { CATEGORY_LABEL, CredentialDialog, DeleteCredentialDialog, FoldersDialog, SecretDialog } from "./vault-dialogs";

export { CATEGORY_LABEL };

const CATEGORY_ICON: Record<string, LucideIcon> = {
  LOGIN: KeyRound,
  EMAIL: Mail,
  API_KEY: Code2,
  OTHER: MoreHorizontal,
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

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
 * The project's vault, as rows or as cards (the View menu): each entry's title, user name, site
 * and folder, with a lock where a password is kept. The Filter menu narrows to one kind (login,
 * email, API key) or one folder. Secrets stay on the server until asked for: an entry's ⋯
 * shows its password or notes for the moment (each reveal is recorded), edits it or deletes
 * it; the header adds an entry and keeps the folders. A viewer without vault access for the
 * project is told so.
 */
export function VaultView({ projectId }: { projectId: string }) {
  const vault = useProjectVault(projectId);
  const filters = usePageFilters(`vault:${projectId}`);
  const view = usePageView("vault");
  const rows = vault.data;
  const [dialog, setDialog] = React.useState<null | { kind: "new" } | { kind: "folders" } | { kind: "edit" | "delete"; credential: VaultCredentialDTO } | { kind: "secret"; credential: VaultCredentialDTO; field: "password" | "notes" }>(null);
  const groups = React.useMemo(
    () => [
      filterGroup(
        filters,
        "kind",
        optionsOf(
          rows,
          (c) => c.category ?? "OTHER",
          (v) => {
            const Icon = CATEGORY_ICON[v] ?? KeyRound;
            return { label: CATEGORY_LABEL[v] ?? v, icon: <Icon /> };
          },
          CATEGORY_ORDER,
        ),
      ),
      filterGroup(
        filters,
        "folder",
        optionsOf(rows, (c) => c.folderName, (v) => ({ label: v, icon: <Folder /> })),
        "Folder",
      ),
    ],
    [rows, filters],
  );
  const scoped = React.useMemo(
    () => rows?.filter((c) => filters.passes("kind", c.category ?? "OTHER") && filters.passes("folder", c.folderName)),
    [rows, filters],
  );
  const list = useList(scoped, { searchText, sorts: SORTS, defaultSort: "title" });
  const isFiltered = list.isFiltered || filters.active;
  const clear = () => {
    list.reset();
    filters.clear();
  };

  if (vault.error) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No access to this vault"
        description="Vault access is given per project, apart from team membership. Ask an admin to add you."
      />
    );
  }

  const menuFor = (c: VaultCredentialDTO) => (
    <RecordMenu contentClassName="min-w-44">
      {c.hasPassword && (
        <DropdownMenuItem onSelect={() => setDialog({ kind: "secret", credential: c, field: "password" })} data-testid="show-password">
          <Eye />
          Show password
        </DropdownMenuItem>
      )}
      {c.hasNotes && (
        <DropdownMenuItem onSelect={() => setDialog({ kind: "secret", credential: c, field: "notes" })} data-testid="show-notes">
          <FileText />
          Show notes
        </DropdownMenuItem>
      )}
      {(c.hasPassword || c.hasNotes) && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", credential: c })} data-testid="edit-credential">
        <Pencil />
        Edit
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete", credential: c })} data-testid="delete-credential">
        <Trash2 />
        Delete
      </DropdownMenuItem>
    </RecordMenu>
  );

  return (
    <div className="flex flex-col">
      <ListTools
        what="entries"
        search={list.query.search}
        onSearch={list.setSearch}
        placeholder="Search the vault…"
        groups={groups}
        view={view}
        sorts={SORTS}
        sort={list.query.sort ?? "title"}
        onSort={list.setSort}
        action={
          rows && (
            <>
              <HeaderAction label="Folders" icon={<FolderCog />} variant="ghost" onClick={() => setDialog({ kind: "folders" })} data-testid="folders-button" />
              <HeaderAction label="New entry" icon={<Plus />} onClick={() => setDialog({ kind: "new" })} data-testid="new-credential-button" />
            </>
          )
        }
      />
      <Collection
        layout={view.cards ? "grid" : "rows"}
        min={view.min}
        items={list.rows}
        total={rows?.length}
        isFiltered={isFiltered}
        onClearFilters={clear}
        isPending={vault.isPending}
        error={null}
        noun={(rows?.length ?? 0) === 1 ? "entry" : "entries"}
        getKey={(c) => c.id}
        skeleton={view.cards ? <RecordCardSkeleton /> : <RecordRowSkeleton />}
        testId="vault-list"
        empty={{ icon: KeyRound, title: "Nothing in the vault yet", description: "Logins, mailboxes and API keys kept for this project appear here." }}
        render={(c) => <CredentialItem credential={c} cards={view.cards} menu={menuFor(c)} />}
      />
      <CredentialDialog projectId={projectId} credential={dialog?.kind === "edit" ? dialog.credential : null} open={dialog?.kind === "new" || dialog?.kind === "edit"} onClose={() => setDialog(null)} />
      <DeleteCredentialDialog projectId={projectId} credential={dialog?.kind === "delete" ? dialog.credential : null} open={dialog?.kind === "delete"} onClose={() => setDialog(null)} />
      <SecretDialog credential={dialog?.kind === "secret" ? dialog.credential : null} field={dialog?.kind === "secret" ? dialog.field : "password"} open={dialog?.kind === "secret"} onClose={() => setDialog(null)} />
      <FoldersDialog projectId={projectId} open={dialog?.kind === "folders"} onClose={() => setDialog(null)} />
    </div>
  );
}

function CredentialItem({ credential: c, cards, menu }: { credential: VaultCredentialDTO; cards: boolean; menu?: React.ReactNode }) {
  const host = hostOf(c.url);
  const Icon = CATEGORY_ICON[c.category ?? "OTHER"] ?? KeyRound;
  const description = [c.username, host].filter(Boolean).join(" · ") || undefined;
  const meta = (
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
  );
  if (cards) {
    return <RecordCard media={<Icon className="size-10 text-muted-foreground" />} title={c.title} description={description} meta={meta} menu={menu} />;
  }
  return (
    <RecordRow
      leading={
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
      }
      title={c.title}
      description={description}
      meta={meta}
      menu={menu}
    />
  );
}
