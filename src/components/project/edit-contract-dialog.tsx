"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateContract } from "@/actions/project";
import { ContractTypePicker, type ContractType } from "./create-project-dialog";

interface Contract {
  id: string;
  label: string | null;
  contractType: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
}

interface Props {
  contract: Contract;
  open: boolean;
  onClose: () => void;
}

function toDateInput(date: Date): string {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

export function EditContractDialog({ contract, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [contractType, setContractType] = useState<ContractType>(contract.contractType as ContractType);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
      const result = await updateContract({
        contractId: contract.id,
        label: (formData.get("label") as string) || "",
        contractType,
        startDate: formData.get("startDate") as string,
        endDate: formData.get("endDate") as string,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    } catch {
      setError("Failed to update contract. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md z-[10000]">
        <DialogHeader>
          <DialogTitle>Edit Contract</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              name="label"
              placeholder="e.g. Phase 2, Renewal"
              defaultValue={contract.label ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Contract Type</Label>
            <ContractTypePicker value={contractType} onChange={setContractType} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                required
                defaultValue={contract.startDate ? toDateInput(new Date(contract.startDate)) : ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                required
                defaultValue={contract.endDate ? toDateInput(new Date(contract.endDate)) : ""}
              />
            </div>
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-[12px] text-destructive">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
