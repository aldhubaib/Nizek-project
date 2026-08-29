import { requireUser } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <AccountClient
      name={user.name ?? ""}
      email={user.email}
      imageUrl={user.imageUrl ?? null}
      isClient={isClientUser(user)}
    />
  );
}
