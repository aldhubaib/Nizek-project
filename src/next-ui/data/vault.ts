"use client";

import { useQuery } from "@tanstack/react-query";

import { listProjectVaultCredentials, type VaultCredentialDTO } from "@/actions/vault";

export type { VaultCredentialDTO } from "@/actions/vault";

export const projectVaultKey = (projectId: string) => ["projects", projectId, "vault"] as const;

/**
 * One project's vault entries, without their secrets (the server never sends a password; a
 * reveal is its own, audited call). The server refuses a viewer without vault access for the
 * project: the query then errors and the screen says so.
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
