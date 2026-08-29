import { MessageSquare } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { getInboxThreads } from "@/actions/messages";

export default async function MessagesIndexPage() {
  const user = await requireUser();
  if (isClientUser(user)) {
    const threads = await getInboxThreads();
    if (threads.length === 1) {
      redirect(`/dashboard/messages/${threads[0].id}`);
    }
    if (threads.length === 0) {
      return null;
    }
  }

  return (
    <div className="grid flex-1 place-items-center text-center text-s text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <MessageSquare className="h-8 w-8 opacity-60" />
        <div>Select a conversation to start messaging</div>
      </div>
    </div>
  );
}
