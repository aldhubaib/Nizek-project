"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PieChart, Plus, X, FileSignature, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EquityMenu } from "@/components/equity/equity-menu";
import {
  createEquityPortfolio,
  type EquityHolderDTO,
  type EquityMetricDTO,
  type EquityPortfolioDTO,
  type EquityRoleDTO,
} from "@/actions/equity";
import { computePortfolioEquity, currentSet, formatPct } from "@/lib/equity-math";
import { EquityRegistryManager } from "@/components/equity/equity-registry-manager";
import { EquityMetricManager } from "@/components/equity/equity-metric-manager";

interface Props {
  portfolios: EquityPortfolioDTO[];
  projectOptions: { id: string; name: string; logoUrl: string | null }[];
  holders: EquityHolderDTO[];
  roles: EquityRoleDTO[];
  metrics: EquityMetricDTO[];
}

const TABS = [
  { id: "portfolios", label: "Portfolios" },
  { id: "registry", label: "Names & roles" },
  { id: "data", label: "Data" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ProjectLogo({ name, logoUrl, size = 9 }: { name: string; logoUrl: string | null; size?: number }) {
  const cls = size === 9 ? "w-9 h-9 text-[13px]" : "w-6 h-6 text-[10px]";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className={cn(cls, "rounded-full object-cover shrink-0")} />;
  }
  return (
    <div className={cn(cls, "rounded-full bg-primary/15 flex items-center justify-center font-semibold text-primary shrink-0")}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export function EquityPageClient({
  portfolios,
  projectOptions,
  holders,
  roles,
  metrics,
}: Props) {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("portfolios");

  async function handleCreate(projectId: string) {
    setCreating(projectId);
    try {
      const { id } = await createEquityPortfolio(projectId);
      router.push(`/dashboard/equity/${id}`);
    } catch (err) {
      alert((err as Error).message || "Failed to create portfolio");
      setCreating(null);
    }
  }

  return (
    <div>
      <PageHeader hasMenu>
        <PieChart className="w-4 h-4 text-primary shrink-0" strokeWidth={1.5} />
        <h1 className="text-sm font-semibold text-foreground flex-1">Equity</h1>
        <EquityMenu />
        {tab === "portfolios" && (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Portfolio
          </button>
        )}
      </PageHeader>

      <div className="px-6 py-6 max-w-5xl mx-auto">
      <p className="text-[13px] text-muted-foreground mb-4">
        Equity deals across startups — vesting, dilution and tranche triggers.
      </p>

      <div className="flex items-center gap-1 border-b border-border mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "registry" && (
        <EquityRegistryManager holders={holders} roles={roles} />
      )}

      {tab === "data" && <EquityMetricManager metrics={metrics} />}

      {tab === "portfolios" &&
        (portfolios.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <PieChart className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1} />
            <p className="text-[13px] text-muted-foreground">
              No portfolios yet. Add one by picking a project.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
          {portfolios.map((p) => {
            const { held, vested } = computePortfolioEquity(p);
            const signedCount = p.contracts.filter((c) => c.signed).length;
            const entries = currentSet(p.sets)?.grants.length ?? 0;
            return (
              <Link
                key={p.id}
                href={`/dashboard/equity/${p.id}`}
                className="group rounded-xl border border-border bg-card p-4 no-underline hover:border-muted-foreground/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <ProjectLogo name={p.project.name} logoUrl={p.project.logoUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-foreground truncate">
                        {p.project.name}
                      </span>
                      {signedCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                          title={`${signedCount} signed contract${signedCount !== 1 ? "s" : ""}`}
                        >
                          <FileSignature className="w-2.5 h-2.5" />
                          Signed
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {entries === 0
                        ? "No equity defined yet"
                        : `${entries} equity ${entries === 1 ? "entry" : "entries"}`}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Equity</p>
                    <p className="text-[15px] font-semibold text-foreground tabular-nums">
                      {formatPct(held)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Vested</p>
                    <p className="text-[15px] font-semibold text-primary tabular-nums">
                      {formatPct(vested)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Contracts</p>
                    <p className="text-[15px] font-semibold text-foreground tabular-nums">
                      {p.contracts.length || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Signed</p>
                    <p className="text-[15px] font-semibold text-foreground tabular-nums">
                      {signedCount || "—"}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
          </div>
        ))}
      </div>

      {/* Project picker */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-sidebar p-5 shadow-xl mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold text-foreground">Add Portfolio</h3>
              <button
                onClick={() => setShowPicker(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-card transition-colors text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground mb-3">
              Pick the project this equity deal belongs to.
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {projectOptions.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => handleCreate(proj.id)}
                  disabled={creating !== null}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors",
                    "hover:bg-card text-[13px] text-foreground disabled:opacity-50",
                    creating === proj.id && "bg-card",
                  )}
                >
                  <ProjectLogo name={proj.name} logoUrl={proj.logoUrl} size={6} />
                  <span className="flex-1 truncate">{proj.name}</span>
                  {creating === proj.id && (
                    <span className="text-[11px] text-muted-foreground">Creating…</span>
                  )}
                </button>
              ))}
              {projectOptions.length === 0 && (
                <p className="text-[12px] text-muted-foreground py-4 text-center">
                  Every project already has a portfolio.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
