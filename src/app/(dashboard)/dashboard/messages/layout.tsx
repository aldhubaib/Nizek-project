import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getInboxThreads } from "@/actions/messages";
import { isClientUser } from "@/lib/client-chat";
import { ThreadSidebar, MessagesMain } from "./messages-client";

export default async function MessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, threads] = await Promise.all([requireUser(), getInboxThreads()]);
  const isClient = isClientUser(user);

  // Normal page inside the dashboard shell (app sidebar stays visible). The
  // shell hides its mobile header on inbox routes, so full height everywhere.
  return (
    <div className="flex h-dvh min-h-0 text-foreground">
      <ThreadSidebar threads={threads} isClient={isClient} />
      <MessagesMain>{children}</MessagesMain>
    </div>
  );
}
