"use client";

import { useParams } from "next/navigation";
import { peekThreadCache } from "@/lib/thread-cache";
import { ThreadChat } from "./thread-chat";

function ThreadPaneSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <div className="h-9 w-9 rounded-full bg-muted/60" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3.5 w-32 rounded bg-muted/60" />
          <div className="h-2.5 w-20 rounded bg-muted/40" />
        </div>
      </div>
      <div className="flex-1" />
      <div className="border-t border-border/60 p-3">
        <div className="h-11 rounded-full bg-muted/40" />
      </div>
    </div>
  );
}

/**
 * Instant chat-pane paint while the server page loads. Only snapshots written
 * by a real opened thread are reused; hover-prefetch entries stay as a skeleton
 * so incomplete permissions/composer metadata cannot flash.
 */
export default function ThreadLoading() {
  const params = useParams<{ threadId: string }>();
  const threadId = typeof params?.threadId === "string" ? params.threadId : "";
  const cached = peekThreadCache(threadId);
  if (cached?.opened && cached.snapshot.channel && cached.snapshot.currentMemberId) {
    return <ThreadChat key={threadId} {...cached.snapshot} />;
  }
  return <ThreadPaneSkeleton />;
}
