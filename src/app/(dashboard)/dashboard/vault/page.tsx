import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessAnyVault } from "@/lib/vault-access";
import {
  listAllVaultCredentials,
  listVaultProjectFolders,
} from "@/actions/vault";
import { VaultPageClient } from "./vault-page-client";

export default async function VaultPage() {
  const user = await requireUser();
  if (!(await canAccessAnyVault(user.id))) redirect("/dashboard");

  const [folders, credentials] = await Promise.all([
    listVaultProjectFolders(),
    listAllVaultCredentials(),
  ]);

  return <VaultPageClient folders={folders} credentials={credentials} />;
}
