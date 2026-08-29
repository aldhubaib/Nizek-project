"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getMessageableMembers,
  getOrCreateDirectConversation,
} from "@/actions/messages";

type MessageableMember = {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
};

export function NewMessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<MessageableMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setLoading(true);
    getMessageableMembers()
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 100);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  }, [members, search]);

  function selectMember(member: MessageableMember) {
    startTransition(async () => {
      const result = await getOrCreateDirectConversation(member.id);
      if (result.ok) {
        onOpenChange(false);
        window.dispatchEvent(
          new CustomEvent("inbox:thread-created", {
            detail: {
              threadId: result.data,
              name: member.name ?? member.email,
              subtitle: member.name ? member.email : "",
              peerImageUrl: member.imageUrl,
              peerMemberIds: [member.id],
            },
          }),
        );
        router.push(`/dashboard/messages/${result.data}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            className="h-10 rounded-lg border-border/60 ps-10 text-s"
          />
        </div>
        <ul className="max-h-72 divide-y divide-border/40 overflow-y-auto -mx-6 px-6">
          {loading && (
            <li className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="py-8 text-center text-s text-muted-foreground">
              {search ? "No one found" : "No team members"}
            </li>
          )}
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={pending}
                className="flex w-full items-center gap-3 py-3 text-start transition-colors hover:bg-surface/60 disabled:opacity-50"
                onClick={() => selectMember(m)}
              >
                {m.imageUrl ? (
                  <Image
                    src={m.imageUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-s font-semibold text-primary">
                    {(m.name ?? m.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-s font-medium">
                    {m.name ?? m.email}
                  </div>
                  {m.name && (
                    <div className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
