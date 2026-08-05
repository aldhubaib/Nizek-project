"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2, Trash } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PageHeaderActions } from "@/components/page-header-actions";
import { PageHeader } from "@/components/page-header";
import {
  emptyTrash,
  purgeTrashItem,
  restoreTrashItem,
  type TrashItemDTO,
} from "@/actions/trash";

export function TrashClient({
  items,
  isAdmin,
}: {
  items: TrashItemDTO[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [error, setError] = useState("");

  async function run(id: string, work: () => Promise<unknown>) {
    setBusyId(id);
    setError("");
    try {
      await work();
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "That didn't work");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader hasMenu={isAdmin && items.length > 0}>
        <Trash
          className="w-4 h-4 text-muted-foreground shrink-0"
          strokeWidth={1.5}
        />
        <h1 className="text-sm font-semibold text-foreground flex-1 truncate">
          Trash
        </h1>
        {isAdmin && items.length > 0 && (
          <PageHeaderActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEmptyOpen(true)}
              disabled={busyId !== null}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Empty trash
            </Button>
          </PageHeaderActions>
        )}
      </PageHeader>

      <div className="px-6 py-6 max-w-5xl mx-auto">
        <p className="text-[12px] text-muted-foreground mb-4">
          Deleted things wait here instead of going straight out. Restoring one
          puts it back exactly as it was.
          {isAdmin
            ? " Emptying the trash is what finally deletes them, and that can't be undone."
            : " An admin has to empty the trash before anything is really gone."}
        </p>

        {error && (
          <p className="text-[12px] text-destructive mb-3">{error}</p>
        )}

        {items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 px-5 py-10 text-center">
            <p className="text-[13px] text-foreground">The trash is empty</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Nothing has been deleted, or it&apos;s already been cleared out.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => {
              const busy = busyId === item.id;
              const when = new Date(item.deletedAt);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
                        {item.noun}
                      </span>
                    </div>
                    {item.sublabel && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {item.sublabel}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      Deleted by {item.deletedBy.name || item.deletedBy.email} on{" "}
                      {when.toLocaleDateString("en-GB")} at{" "}
                      {when.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(item.id, () => restoreTrashItem(item.id))
                      }
                    >
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Restore
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (
                            !confirm(
                              `Permanently delete "${item.label}"? This cannot be undone.`,
                            )
                          )
                            return;
                          run(item.id, () => purgeTrashItem(item.id));
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete forever
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EmptyTrashDialog
        open={emptyOpen}
        onOpenChange={setEmptyOpen}
        count={items.length}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

/** Emptying is the only step that actually deletes, so it asks once more. */
function EmptyTrashDialog({
  open,
  onOpenChange,
  count,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleEmpty() {
    setBusy(true);
    setError("");
    try {
      await emptyTrash();
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError((err as Error).message || "Failed to empty the trash");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Empty the trash?</DialogTitle>
          <DialogDescription>
            {count} {count === 1 ? "item" : "items"} will be deleted for good,
            along with everything inside them. There is no way back from this.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-[12px] text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleEmpty} disabled={busy}>
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Delete everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
