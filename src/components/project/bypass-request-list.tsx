"use client";

import { useEffect, useState } from "react";
import {
  approveProofBypass,
  rejectProofBypass,
} from "@/actions/proof-bypass-decide";
import { type ProofBypassRequest } from "@/actions/proof-of-work";
import { Button } from "@/components/ui/button";
import { SprintTaskRow } from "@/components/project/sprint-task-row";
import { cn } from "@/lib/utils";

function statusLabel(status: ProofBypassRequest["status"]) {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "USED":
      return "Used";
  }
}

function requesterInitials(name: string | null) {
  return name?.split(" ").map((n) => n[0]).join("") ?? "?";
}

export function BypassRequestList({
  requests,
  canDecide,
  currentUserId,
  onChanged,
  onOpenTask,
}: {
  requests: ProofBypassRequest[];
  canDecide: boolean;
  currentUserId: string;
  onChanged?: (id: string, status: "APPROVED" | "REJECTED" | "USED", taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const [rows, setRows] = useState(requests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(requests);
  }, [requests]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "approve") await approveProofBypass(id);
      else await rejectProofBypass(id);
      const status = action === "approve" ? "USED" : "REJECTED";
      const taskId = rows.find((row) => row.id === id)?.task.id ?? "";
      setRows((prev) => prev.filter((row) => row.id !== id));
      onChanged?.(id, status, taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update request");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="py-10 text-center text-s text-muted-foreground">No pending bypass requests.</p>;
  }

  return (
    <div className="space-y-1.5">
      {error ? <p className="px-1 text-s text-destructive">{error}</p> : null}
      {rows.map((row) => {
        const requesterName = row.requestedBy.name ?? "Someone";
        const showActions = canDecide && row.status === "PENDING";
        return (
          <SprintTaskRow
            key={row.id}
            as="div"
            task={row.task}
            assigneeSlot={<></>}
            className="cursor-pointer"
            onClick={() => onOpenTask(row.task.id)}
            footer={
              <div className="flex items-center gap-2">
                {row.requestedBy.imageUrl ? (
                  <img
                    src={row.requestedBy.imageUrl}
                    alt={requesterName}
                    className="block size-5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                    {requesterInitials(row.requestedBy.name)}
                  </span>
                )}
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {requesterName}
                  {row.requestedBy.id === currentUserId ? " (you)" : ""}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {showActions ? (
                    <>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void decide(row.id, "reject");
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        size="xs"
                        disabled={busyId === row.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void decide(row.id, "approve");
                        }}
                      >
                        Approve
                      </Button>
                    </>
                  ) : (
                    <span
                      className={cn(
                        "text-xs font-medium",
                        row.status === "PENDING" && "text-orange",
                        row.status === "APPROVED" && "text-success",
                        row.status === "REJECTED" && "text-destructive",
                        row.status === "USED" && "text-muted-foreground",
                      )}
                    >
                      {statusLabel(row.status)}
                    </span>
                  )}
                </div>
              </div>
            }
          />
        );
      })}
    </div>
  );
}
