import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getInboxThreads } from "@/actions/messages";
import { ThreadSidebar, MessagesMain } from "./messages-client";

export default async function MessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  const threads = await getInboxThreads();

  // Normal page inside the dashboard shell (app sidebar stays visible). The
  // shell's mobile header is 3rem tall and fixed, hence the reduced height there.
  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 bg-background text-foreground lg:h-dvh">
      <ThreadSidebar threads={threads} />
      <MessagesMain>{children}</MessagesMain>
    </div>
  );
}
