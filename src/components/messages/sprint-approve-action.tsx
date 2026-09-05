"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Hourglass, Loader2 } from "lucide-react";
import {
  approveSprint,
  getSprintApprovalState,
  type SprintApprovalState,
} from "@/actions/sprint";
import { ACTIVITY_ACTION_CLASS } from "@/components/messages/activity-card";
import { ConfirmApproveSprintDialog } from "@/components/messages/confirm-approve-sprint-dialog";
import { cn } from "@/lib/utils";

/**
 * Accepting a sprint, on the review card in chat.
 *
 * Shipping has always been the client signing off rather than the team
 * declaring itself done, so the button is live for them and inert for
 * everyone else — staff read it to see whether the sprint is still waiting.
 */
export function SprintApproveAction({ sprintId }: { sprintId: string }) {
  const [state, setState] = useState<SprintApprovalState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSprintApprovalState(sprintId)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      // A sprint deleted out from under an old card, or a viewer who has since
      // left the project: the card is still worth reading without the button.
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sprintId]);

  if (!state) return null;

  if (state.status === "SHIPPED") {
    return (
      <div
        className={cn(
          ACTIVITY_ACTION_CLASS,
          "border-success/30 bg-success/5 text-success",
        )}
      >
        <CircleCheck className="size-4 shrink-0" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate text-foreground">
          Approved by the client
        </span>
      </div>
    );
  }

  if (!state.awaitingApproval) return null;

  if (!state.canApprove) {
    return (
      <div
        className={cn(
          ACTIVITY_ACTION_CLASS,
          "border-border/60 bg-muted/30 text-muted-foreground",
        )}
      >
        <Hourglass className="size-4 shrink-0" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate">Waiting for client approval</span>
      </div>
    );
  }

  const approve = async () => {
    setSaving(true);
    setError(null);
    try {
      const sprint = await approveSprint(sprintId);
      setConfirming(false);
      setState({
        status: sprint.status,
        sprintName: state.sprintName,
        awaitingApproval: false,
        canApprove: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve the sprint");
      setConfirming(false);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={saving}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        className={cn(
          ACTIVITY_ACTION_CLASS,
          "border-success/30 bg-success/5 text-success hover:bg-success/10",
          saving && "opacity-60",
        )}
      >
        {saving ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <CircleCheck className="size-4 shrink-0" strokeWidth={2} />
        )}
        <span className="min-w-0 flex-1 truncate text-foreground">Approve</span>
      </button>
      {error ? <p className="px-1 text-xs text-destructive">{error}</p> : null}
      <ConfirmApproveSprintDialog
        open={confirming}
        sprintName={state.sprintName}
        saving={saving}
        onOpenChange={setConfirming}
        onConfirm={() => void approve()}
      />
    </div>
  );
}
