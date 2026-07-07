import { MessageSquare } from "lucide-react";

export default function MessagesIndexPage() {
  return (
    <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <MessageSquare className="h-8 w-8 opacity-60" />
        <div>Select a conversation to start messaging</div>
      </div>
    </div>
  );
}
