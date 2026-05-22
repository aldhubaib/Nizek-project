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

interface Props {
  projectId: string;
}

export function AddContractDialog({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contractType, setContractType] = useState<ContractType>("FULL_TEAM");
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
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" placeholder="e.g. Phase 2, Renewal" />
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
