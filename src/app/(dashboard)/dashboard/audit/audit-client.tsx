"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ClipboardCheck,
  Plus,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createTodayAudit,
  type AuditAccess,
  type AuditReportRow,
} from "@/actions/audit";

interface Props {
  access: AuditAccess;
  reports: AuditReportRow[];
}

export function AuditClient({ access, reports }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>(
    access.teams.map((t) => t.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const todayIso = new Date().toISOString().slice(0, 10);
  const hasTodayReport = reports.some(
    (r) => r.auditDate.slice(0, 10) === todayIso && r.createdBy.id === access.userId,
  );

  const toggleTeam = (id: string) =>
    setSelectedTeams((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createTodayAudit(selectedTeams);
        router.push(`/dashboard/audit/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create report");
      }
    });
  };

  return (
    <div>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6 pr-14">
        <h1 className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          Task Audit
          <span className="text-[11px] font-normal text-muted-foreground">
            ({reports.length} report{reports.length === 1 ? "" : "s"})
          </span>
        </h1>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          {hasTodayReport ? "Today's report" : "Create report"}
        </Button>
      </div>

      <div className="p-6">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="mb-2 h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No audit reports yet</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Create today&apos;s report to review flagged tasks across your teams.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="divide-y divide-border/50">
              {reports.map((r) => {
                const submitted = r.status === "submitted";
                return (
                  <Link
                    key={r.id}
                    href={`/dashboard/audit/${r.id}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/20"
                  >
                    <div
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-lg border",
                        submitted
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-400",
                      )}
                    >
                      {submitted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <CircleDashed className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">
                        {format(new Date(r.auditDate), "EEEE, MMM d, yyyy")}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {r.teamNames.join(", ") || "All teams"}
                        {access.isAdmin && r.createdBy.name
                          ? ` · by ${r.createdBy.name}`
                          : ""}
                      </p>
                    </div>

                    <div className="hidden items-center gap-4 text-[11px] text-muted-foreground sm:flex">
                      <span>
                        {r.decidedItems}/{r.totalItems} reviewed
                      </span>
                      {r.blamedItems > 0 && (
                        <span className="text-red-400">{r.blamedItems} blamed</span>
                      )}
                      {r.excusedItems > 0 && (
                        <span className="text-emerald-400">
                          {r.excusedItems} excused
                        </span>
                      )}
                    </div>

                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                        submitted
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-400",
                      )}
                    >
                      {submitted ? "Submitted" : "Draft"}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create today&apos;s report</DialogTitle>
            <DialogDescription>
              {format(new Date(), "EEEE, MMM d, yyyy")} — pick which teams to
              audit. The system snapshots every flagged task from their
              projects.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {access.teams.map((team) => {
              const checked = selectedTeams.includes(team.id);
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => toggleTeam(team.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-card hover:bg-accent/20",
                  )}
                >
                  <div
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {checked && <CheckCircle2 className="h-3 w-3" />}
                  </div>
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[13px] font-medium">{team.name}</span>
                </button>
              );
            })}
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedTeams.length === 0 || isPending}
              onClick={handleCreate}
            >
              {isPending ? "Creating…" : "Create report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
