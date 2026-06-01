"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Users, UserMinus, Lock, Wrench, Rocket } from "lucide-react";
import { createProject } from "@/actions/project";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
}

export type ContractType = "FULL_TEAM" | "PART_TEAM" | "FIXED" | "MAINTENANCE" | "STARTUP";

export const CONTRACT_TYPES: { id: ContractType; label: string; icon: typeof Users; description: string; color: string }[] = [
  { id: "FULL_TEAM", label: "Full Team", icon: Users, description: "Dedicated team, ongoing work", color: "bg-primary/15 border-primary/40 text-primary" },
  { id: "PART_TEAM", label: "Part Team", icon: UserMinus, description: "Shared resources, part-time", color: "bg-violet-500/15 border-violet-500/40 text-violet-400" },
  { id: "FIXED", label: "Fixed", icon: Lock, description: "Fixed scope and timeline", color: "bg-amber-500/15 border-amber-500/40 text-amber-400" },
  { id: "MAINTENANCE", label: "Maintenance", icon: Wrench, description: "Bug fixes and upkeep", color: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400" },
  { id: "STARTUP", label: "Startup", icon: Rocket, description: "Startup engagement", color: "bg-rose-500/15 border-rose-500/40 text-rose-400" },
];

export function ContractTypePicker({ value, onChange }: { value: ContractType; onChange: (v: ContractType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {CONTRACT_TYPES.map((t) => {
        const Icon = t.icon;
        const isActive = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
              isActive ? t.color : "border-border text-muted-foreground hover:border-muted-foreground/40"
            )}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-tight">{t.label}</div>
              <div className="text-[10px] opacity-60 leading-tight mt-0.5">{t.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface ContractPrefixOption {
  id: string;
  prefix: string;
  name: string;
}

export function CreateProjectDialog({ teams = [], contractPrefixes = [] }: { teams?: Team[]; contractPrefixes?: ContractPrefixOption[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contractType, setContractType] = useState<ContractType>("FULL_TEAM");
  const [teamId, setTeamId] = useState("");
  const [prefixId, setPrefixId] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!teamId) return;
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    try {
      const project = await createProject({
        name: formData.get("name") as string,
        description: (formData.get("description") as string) || undefined,
        teamId,
        contract: {
          label: (formData.get("contractLabel") as string) || undefined,
          prefixId: prefixId || undefined,
          contractNumber: contractNumber || undefined,
          contractType,
          startDate: formData.get("startDate") as string,
          endDate: formData.get("endDate") as string,
        },
      });
      setOpen(false);
      router.push(`/dashboard/projects/${project.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        New Project
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input id="name" name="name" required placeholder="e.g. Mobile App Redesign" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team">
              Team <span className="text-destructive">*</span>
            </Label>
            {teams.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No teams yet. Create one in{" "}
                <a href="/dashboard/settings" className="text-primary underline">Settings</a>.
              </p>
            ) : (
              <select
                id="team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select a team...</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Brief project description..."
              rows={3}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
            <p className="text-sm font-medium">Initial Contract</p>

            <div className="space-y-2">
              <Label>Contract Code</Label>
              {contractPrefixes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No prefixes defined. Add them in{" "}
                  <a href="/dashboard/settings" className="text-primary underline">Settings</a>.
                </p>
              ) : (
                <div className="flex items-center gap-0">
                  <select
                    value={prefixId}
                    onChange={(e) => setPrefixId(e.target.value)}
                    className="rounded-l-md rounded-r-none border border-r-0 border-border bg-muted/50 px-3 py-2 text-[13px] text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
                  >
                    <option value="">Prefix</option>
                    {contractPrefixes.map((p) => (
                      <option key={p.id} value={p.id}>{p.prefix}-</option>
                    ))}
                  </select>
                  <Input
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    placeholder="001"
                    disabled={!prefixId}
                    className="rounded-l-none text-[13px] font-mono"
                  />
                </div>
              )}
              {prefixId && contractNumber && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Code: {contractPrefixes.find((p) => p.id === prefixId)?.prefix}-{contractNumber}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractLabel">Label</Label>
              <Input
                id="contractLabel"
                name="contractLabel"
                placeholder="e.g. Phase 1, MVP (optional)"
              />
            </div>

            <div className="space-y-2">
              <Label>Contract Type</Label>
              <ContractTypePicker value={contractType} onChange={setContractType} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" name="endDate" type="date" required />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !teamId}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

