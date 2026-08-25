"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, History, Loader2, Trash2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import {
  deleteEquityPortfolio,
  getEquityActivity,
  type EquityActivityDTO,
} from "@/actions/equity";

const SECTION_LABELS: Record<string, string> = {
  PORTFOLIO: "Portfolio",
  OPPORTUNITY: "Opportunity",
  PRODUCT: "The product",
  MARKET_VALIDATION: "Market validation",
  MARKET: "Market size",
  BUSINESS_MODEL: "Business model",
  MARKET_ADOPTION: "Market adoption",
  TRACTION: "Traction",
  COMPETITION: "Competition",
  CONTRACTS: "Contracts",
  EQUITY: "Equity",
  FINANCIALS: "Financials",
  PERFORMANCE: "Performance",
  TEAM: "Team",
  TRANCHES: "Tranches",
};

export function PortfolioMenu({
  portfolioId,
  projectName,
}: {
  portfolioId: string;
  projectName: string;
}) {
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [entries, setEntries] = useState<EquityActivityDTO[] | null>(null);
  const [historyError, setHistoryError] = useState("");

  // Loaded when the menu item is clicked rather than when the dialog mounts, so
  // the request is already in flight by the time the dialog is on screen.
  async function openHistory() {
    setHistoryOpen(true);
    setEntries(null);
    setHistoryError("");
    try {
      setEntries(await getEquityActivity(portfolioId));
    } catch (err) {
      setHistoryError((err as Error).message || "Couldn't load the history");
    }
  }

  function openDelete() {
    setTyped("");
    setDeleteError("");
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (typed.trim() !== projectName) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteEquityPortfolio(portfolioId, typed);
      router.push("/dashboard/equity");
    } catch (err) {
      setDeleteError((err as Error).message || "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Sits in the shell's shared ⋮ in the top-right chrome. */}
      <PageOverflowItems id="portfolio-menu">
            <DropdownMenuItem
              onClick={() =>
                router.push(`/dashboard/equity/${portfolioId}/preview`)
              }
            >
              <Eye className="h-4 w-4" />
              <span className="flex-1">Preview</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openHistory}>
              <History className="h-4 w-4" />
              <span className="flex-1">History</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openDelete} variant="destructive">
              <Trash2 className="h-4 w-4" />
              <span className="flex-1">Delete portfolio</span>
            </DropdownMenuItem>
      </PageOverflowItems>

      {/*
        Deleting takes the project's name typed back. A portfolio is years of
        contracts, splits and financials behind one menu item, and the name is
        the one thing nobody types by reflex.
      */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {projectName}?</DialogTitle>
            <DialogDescription>
              This moves the portfolio to the trash with everything in it — the
              contracts, every equity split, the financials and the pitch. It
              can be restored until the trash is emptied.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-s text-muted-foreground">
              Type <strong className="text-foreground">{projectName}</strong> to
              confirm:
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={projectName}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleDelete()}
            />
            {deleteError && (
              <p className="text-s text-destructive">{deleteError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={typed.trim() !== projectName || deleting}
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Move to trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entries={entries}
        error={historyError}
      />
    </>
  );
}

/** Every recorded change to this portfolio, newest first. */
function HistoryDialog({
  open,
  onOpenChange,
  entries,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: EquityActivityDTO[] | null;
  error: string;
}) {
  const [section, setSection] = useState("ALL");

  // Only sections that have actually been touched, so the filter isn't a row of
  // buttons that all lead to an empty list.
  const sections = [...new Set((entries ?? []).map((e) => e.section))];
  const shown = (entries ?? []).filter(
    (e) => section === "ALL" || e.section === section,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Who changed what, newest first. Recorded as each change was saved.
          </DialogDescription>
        </DialogHeader>

        {sections.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            {["ALL", ...sections].map((id) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  "px-2.5 h-7 rounded-lg text-s font-medium transition-colors",
                  section === id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                {id === "ALL" ? "Everything" : (SECTION_LABELS[id] ?? id)}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {error && <p className="text-s text-destructive py-2">{error}</p>}

          {entries === null && !error && (
            <div className="flex items-center gap-2 text-s text-muted-foreground py-6">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading history…
            </div>
          )}

          {entries !== null && shown.length === 0 && (
            <p className="text-s text-muted-foreground py-6">
              Nothing recorded yet. Changes from here on will show up.
            </p>
          )}

          <div className="space-y-1">
            {shown.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

const ACTION_TONE: Record<string, string> = {
  created: "text-success bg-success/15 border-success/30",
  updated: "text-sky bg-sky/15 border-sky/30",
  deleted: "text-destructive bg-destructive/15 border-destructive/30",
  restored: "text-violet bg-violet/15 border-violet/30",
};

function HistoryRow({ entry }: { entry: EquityActivityDTO }) {
  const when = new Date(entry.createdAt);
  const who = entry.user.name || entry.user.email;

  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span
          className={cn(
            "px-1.5 py-0.5 rounded-full border font-medium capitalize",
            ACTION_TONE[entry.action] ??
              "text-muted-foreground bg-muted border-border",
          )}
        >
          {entry.action}
        </span>
        <span className="text-muted-foreground/60">
          {SECTION_LABELS[entry.section] ?? entry.section}
        </span>
        {entry.subject && (
          <span className="text-muted-foreground">{entry.subject}</span>
        )}
        <span className="flex-1" />
        <span className="text-muted-foreground/60 tabular-nums">
          {when.toLocaleDateString("en-GB")}{" "}
          {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="mt-1 text-s text-foreground break-words">
        {entry.label && (
          <span className="text-muted-foreground">{entry.label}: </span>
        )}
        {entry.oldValue != null && (
          <>
            <span className="line-through text-muted-foreground/70">
              {entry.oldValue}
            </span>
            {entry.newValue != null && (
              <span className="text-muted-foreground/60"> → </span>
            )}
          </>
        )}
        {entry.newValue != null ? (
          <span>{entry.newValue}</span>
        ) : (
          entry.oldValue == null && (
            <span className="text-muted-foreground">—</span>
          )
        )}
      </div>

      <p className="mt-0.5 text-xs text-muted-foreground/60">{who}</p>
    </div>
  );
}
