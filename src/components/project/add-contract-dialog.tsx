"use client";

import { useState } from "react";
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
import { Plus } from "lucide-react";
import { addContract } from "@/actions/project";
import { ContractTypePicker, type ContractType } from "./create-project-dialog";

interface ContractPrefixOption {
  id: string;
  prefix: string;
  name: string;
}

interface Props {
  projectId: string;
  contractPrefixes?: ContractPrefixOption[];
}

export function AddContractDialog({ projectId, contractPrefixes = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contractType, setContractType] = useState<ContractType>("FULL_TEAM");
  const [prefixId, setPrefixId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
      const result = await addContract({
        projectId,
        label: (formData.get("label") as string) || undefined,
        prefixId: prefixId || undefined,
        contractType,
        startDate: formData.get("startDate") as string,
        endDate: formData.get("endDate") as string,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    } catch {
      setError("Failed to add contract. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" />}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Contract
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contract</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {contractPrefixes.length > 0 && (
            <div className="space-y-2">
              <Label>Contract Code</Label>
              <select
                value={prefixId}
                onChange={(e) => setPrefixId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No prefix (optional)</option>
                {contractPrefixes.map((p) => (
                  <option key={p.id} value={p.id}>{p.prefix} — {p.name}</option>
                ))}
              </select>
              {prefixId && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Code will be auto-generated (e.g. {contractPrefixes.find((p) => p.id === prefixId)?.prefix}-001)
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" placeholder="e.g. Phase 2, Renewal (optional)" />
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
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-[12px] text-destructive">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Contract"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
