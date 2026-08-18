"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ClipboardCheck,
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
import { PageHeader } from "@/components/page-header";
import { AddButton } from "@/components/add-button";
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
      <PageHeader className="justify-between">
        <h1 className="flex items-center gap-2 text-s font-semibold">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          Task Audit
          <span className="text-xs font-normal text-muted-foreground">
            ({reports.length} report{reports.length === 1 ? "" : "s"})
          </span>
        </h1>
        <AddButton
          label={hasTodayReport ? "Today's report" : "Create report"}
          onClick={() => setCreateOpen(true)}
        />
      </PageHeader>

      <div className="px-app py-6">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="mb-2 h-8 w-8 text-muted-foreground/20" />
            <p className="text-s text-muted-foreground">No audit reports yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
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
                          ? "border-success/20 bg-success/10 text-success"
                          : "border-orange/20 bg-orange/10 text-orange",
                      )}
                    >
                      {submitted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <CircleDashed className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-s font-medium">
                        {format(new Date(r.auditDate), "EEEE, MMM d, yyyy")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.teamNames.join(", ") || "All teams"}
                        {access.isAdmin && r.createdBy.name
                          ? ` · by ${r.createdBy.name}`
                          : ""}
                      </p>
                    </div>

                    <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                      <span>
                        {r.decidedItems}/{r.totalItems} reviewed
                      </span>
                      {r.blamedItems > 0 && (
                        <span className="text-destructive">{r.blamedItems} blamed</span>
                      )}
                      {r.excusedItems > 0 && (
                        <span className="text-success">
                          {r.excusedItems} excused
                        </span>
                      )}
                    </div>

                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        submitted
                          ? "border-success/20 bg-success/10 text-success"
                          : "border-orange/20 bg-orange/10 text-orange",
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
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors",
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
                  <span className="text-s font-medium">{team.name}</span>
                </button>
              );
            })}
          </div>

          {error && <p className="text-s text-destructive">{error}</p>}

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
