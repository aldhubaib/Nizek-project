"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  KeyRound,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { VaultCredentialsPanel } from "@/components/vault/vault-credentials-panel";
import type {
  VaultCredentialDTO,
  VaultProjectFolderDTO,
} from "@/actions/vault";

function credentialMatches(c: VaultCredentialDTO, q: string) {
  return (
    c.title.toLowerCase().includes(q) ||
    (c.username ?? "").toLowerCase().includes(q) ||
    (c.url ?? "").toLowerCase().includes(q) ||
    (c.category ?? "").toLowerCase().includes(q) ||
    (c.folderName ?? "").toLowerCase().includes(q)
  );
}

export function VaultPageClient({
  folders,
  credentials,
}: {
  folders: VaultProjectFolderDTO[];
  credentials: VaultCredentialDTO[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openProjectId = searchParams.get("project");

  const openFolder = folders.find((f) => f.id === openProjectId) ?? null;
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  /** Folders whose name matches, or that contain a matching credential. */
  const filteredFolders = useMemo(() => {
    if (!q) return folders;
    return folders.filter((f) => {
      if (f.name.toLowerCase().includes(q)) return true;
      return credentials.some(
        (c) => c.projectId === f.id && credentialMatches(c, q),
      );
    });
  }, [folders, credentials, q]);

  /** Credential hits across all folders — shown under the folder list when searching. */
  const matchedCredentials = useMemo(() => {
    if (!q) return [];
    return credentials.filter((c) => credentialMatches(c, q));
  }, [credentials, q]);

  const projectCredentials = useMemo(() => {
    if (!openFolder) return [];
    return credentials.filter((c) => c.projectId === openFolder.id);
  }, [credentials, openFolder]);

  function openProject(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", id);
    router.replace(`/dashboard/vault?${params.toString()}`);
  }

  function backToFolders() {
    router.replace("/dashboard/vault");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          Vault
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {openFolder
            ? `Credentials for ${openFolder.name}. Search within this project below.`
            : "Search projects or credentials inside them. Open a folder to manage its entries."}
        </p>
      </div>

      {openFolder ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={backToFolders}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All projects
          </button>

          <div className="flex items-center gap-2.5">
            <ProjectGlyph name={openFolder.name} logoUrl={openFolder.logoUrl} />
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold">
                {openFolder.name}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {projectCredentials.length} credential
                {projectCredentials.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <VaultCredentialsPanel
            key={openFolder.id}
            credentials={projectCredentials}
            projectId={openFolder.id}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects or credentials"
              className="h-9 pl-8 text-sm"
            />
          </div>

          {filteredFolders.length === 0 && matchedCredentials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <Folder className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-[13px] font-medium text-foreground">
                {folders.length === 0
                  ? "No project folders yet"
                  : "No matches"}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {folders.length === 0
                  ? "An admin grants Vault access per project in Admin → Vault Access."
                  : "Try a project name, login title, email, or URL."}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {filteredFolders.length > 0 && (
                <ul className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border/50">
                  {filteredFolders.map((folder) => {
                    const hitCount = q
                      ? credentials.filter(
                          (c) =>
                            c.projectId === folder.id &&
                            credentialMatches(c, q),
                        ).length
                      : 0;
                    return (
                      <li key={folder.id}>
                        <button
                          type="button"
                          onClick={() => openProject(folder.id)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                        >
                          <ProjectGlyph
                            name={folder.name}
                            logoUrl={folder.logoUrl}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold">
                              {folder.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {q && hitCount > 0
                                ? `${hitCount} match${hitCount === 1 ? "" : "es"} · ${folder.credentialCount} total`
                                : `${folder.credentialCount} credential${folder.credentialCount === 1 ? "" : "s"}`}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {q && matchedCredentials.length > 0 && (
                <div className="space-y-2">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Matching credentials
                  </p>
                  <VaultCredentialsPanel
                    key={`search-${q}`}
                    credentials={matchedCredentials}
                    showProjectColumn
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectGlyph({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
      <span className="text-[12px] font-bold text-primary">
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
