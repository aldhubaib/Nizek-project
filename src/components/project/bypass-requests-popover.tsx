"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Film } from "lucide-react";
import {
  canCurrentUserBypassProof,
  listProofBypassRequests,
  type ProofBypassRequest,
} from "@/actions/proof-of-work";
import { BypassRequestList } from "@/components/project/bypass-request-list";
import { useChannel } from "@/components/realtime/hooks";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { projectChannel } from "@/lib/channels";
import { useKanbanStore } from "@/store/kanban";

export function BypassRequestsPopover({
  projectId,
  currentUserId,
}: {
  projectId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const cent = useCentrifugo();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [requests, setRequests] = useState<ProofBypassRequest[] | null>(null);
  const [canDecide, setCanDecide] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([listProofBypassRequests(projectId), canCurrentUserBypassProof(projectId)])
      .then(([rows, decide]) => {
        const pending = rows.filter((row) => row.status === "PENDING");
        setRequests(pending);
        setCanDecide(decide);
        setCount(pending.length);
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useChannel(
    cent?.enabled ? projectChannel(projectId) : null,
    useCallback(
      (data: unknown) => {
        const ev = data as { type?: string; passId?: string; taskId?: string; requesterId?: string; deciderId?: string } | null;
        if (!ev?.type?.startsWith("proof-bypass.")) return;
        if (ev.requesterId === currentUserId || ev.deciderId === currentUserId) return;

        if (ev.type === "proof-bypass.requested") {
          setCount((c) => c + 1);
          if (requests !== null) refresh();
        } else if (ev.type === "proof-bypass.approved" || ev.type === "proof-bypass.rejected") {
          setCount((c) => Math.max(0, c - 1));
          setRequests((prev) => (prev ? prev.filter((row) => row.id !== ev.passId) : prev));
          if (ev.type === "proof-bypass.approved" && ev.taskId) {
            const order = useKanbanStore
              .getState()
              .tasks.filter((t) => t.stage === "INTERNAL_REVIEW").length;
            useKanbanStore.getState().moveTask(ev.taskId, "INTERNAL_REVIEW", order);
          }
        }
      },
      [currentUserId, requests, refresh],
    ),
    refresh,
  );

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    refresh();
  }

  return (
    <div ref={ref} className="relative ms-auto">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Video bypass requests"
        title="Video bypass requests"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Film className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[999] flex max-h-[min(32rem,calc(100dvh-6rem))] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-s font-semibold">Video bypass</span>
              {count > 0 && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-px text-xs font-semibold text-primary">
                  {count}
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {requests ? (
              <BypassRequestList
                requests={requests}
                canDecide={canDecide}
                currentUserId={currentUserId}
                onChanged={(_id, status, taskId) => {
                  setRequests((prev) => (prev ? prev.filter((row) => row.id !== _id) : prev));
                  if (status === "APPROVED" || status === "REJECTED" || status === "USED") {
                    setCount((c) => Math.max(0, c - 1));
                  }
                  if (status === "USED" && taskId) {
                    const order = useKanbanStore
                      .getState()
                      .tasks.filter((t) => t.stage === "INTERNAL_REVIEW").length;
                    useKanbanStore.getState().moveTask(taskId, "INTERNAL_REVIEW", order);
                  }
                }}
                onOpenTask={(taskId) => {
                  setOpen(false);
                  router.push(`/dashboard/projects/${projectId}/tasks/${taskId}`);
                }}
              />
            ) : (
              <p className="py-10 text-center text-s text-muted-foreground">Loading…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
