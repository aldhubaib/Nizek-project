"use client";

import { VaultCredentialsPanel } from "@/components/vault/vault-credentials-panel";
import type { VaultCredentialDTO } from "@/actions/vault";

interface Props {
  projectId: string;
  credentials: VaultCredentialDTO[];
}

export function VaultTab({ projectId, credentials }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[13px] font-semibold">Vault</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Passwords, emails, and API keys for this project. History tracks who
          changed what. Deletes go to Trash for admin restore only.
        </p>
      </div>
      <VaultCredentialsPanel
        credentials={credentials}
        projectId={projectId}
      />
    </div>
  );
}
