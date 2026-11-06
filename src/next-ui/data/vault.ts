"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createVaultCredential,
  createVaultFolder,
  deleteVaultCredential,
  deleteVaultFolder,
  listProjectVaultCredentials,
  listVaultFolders,
  renameVaultFolder,
  revealVaultSecret,
  updateVaultCredential,
  type VaultCredentialDTO,
  type VaultFolderDTO,
} from "@/actions/vault";

export type { VaultCredentialDTO, VaultFolderDTO } from "@/actions/vault";

export const projectVaultKey = (projectId: string) => ["projects", projectId, "vault"] as const;
export const vaultFoldersKey = (projectId: string) => ["projects", projectId, "vault-folders"] as const;

/** The vault actions answer `{ ok, data | error }`; the hooks turn a refusal into a thrown error with its words. */
function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

/**
 * One project's vault entries, without their secrets (the server never sends a password; a
 * reveal is its own, audited call). The server refuses a viewer without vault access for the
 * project: the query then errors and the screen says so. The changes — a new entry, an edit,
 * a delete, the folders — go through the same actions the live panel calls.
 */
export function useProjectVault(projectId: string) {
  return useQuery<VaultCredentialDTO[]>({
    queryKey: projectVaultKey(projectId),
    queryFn: () => listProjectVaultCredentials(projectId),
    enabled: projectId !== "",
    staleTime: 30_000,
    retry: false,
  });
}

export function useVaultFolders(projectId: string, enabled = true) {
  return useQuery<VaultFolderDTO[]>({
    queryKey: vaultFoldersKey(projectId),
    queryFn: () => listVaultFolders(projectId),
    enabled: enabled && projectId !== "",
    staleTime: 30_000,
    retry: false,
  });
}

function useVaultRefresh(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: projectVaultKey(projectId) }), qc.invalidateQueries({ queryKey: vaultFoldersKey(projectId) })]).then(
      () => undefined,
    );
}

export type NewCredentialInput = Omit<Parameters<typeof createVaultCredential>[0], "projectId">;
export type CredentialChanges = Parameters<typeof updateVaultCredential>[1];

export function useCreateCredential(projectId: string) {
  const refresh = useVaultRefresh(projectId);
  return useMutation({ mutationFn: async (input: NewCredentialInput) => unwrap(await createVaultCredential({ projectId, ...input })), onSettled: refresh });
}

export function useUpdateCredential(projectId: string) {
  const refresh = useVaultRefresh(projectId);
  return useMutation({
    mutationFn: async ({ id, ...changes }: CredentialChanges & { id: string }) => unwrap(await updateVaultCredential(id, changes)),
    onSettled: refresh,
  });
}

export function useDeleteCredential(projectId: string) {
  const refresh = useVaultRefresh(projectId);
  return useMutation({ mutationFn: async (id: string) => unwrap(await deleteVaultCredential(id)), onSettled: refresh });
}

/** One secret, for the moment it is shown or copied; every reveal is written to the vault's activity. */
export function useRevealSecret() {
  return useMutation({
    mutationFn: async ({ id, field }: { id: string; field: "password" | "notes" }) => unwrap(await revealVaultSecret(id, field)).value,
  });
}

export function useCreateFolder(projectId: string) {
  const refresh = useVaultRefresh(projectId);
  return useMutation({ mutationFn: async (name: string) => unwrap(await createVaultFolder(projectId, name)), onSettled: refresh });
}

export function useRenameFolder(projectId: string) {
  const refresh = useVaultRefresh(projectId);
  return useMutation({ mutationFn: async ({ id, name }: { id: string; name: string }) => unwrap(await renameVaultFolder(id, name)), onSettled: refresh });
}

export function useDeleteFolder(projectId: string) {
  const refresh = useVaultRefresh(projectId);
  return useMutation({ mutationFn: async (id: string) => unwrap(await deleteVaultFolder(id)), onSettled: refresh });
}
