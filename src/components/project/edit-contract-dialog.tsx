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

interface ContractPrefixOption {
  id: string;
  prefix: string;
  name: string;
}

interface Contract {
  id: string;
  label: string | null;
  code: string | null;
  contractType: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  prefixId?: string | null;
}

interface Props {
  contract: Contract;
  contractPrefixes?: ContractPrefixOption[];
  open: boolean;
  onClose: () => void;
}

function toDateInput(date: Date): string {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

function parseExistingCode(code: string | null, prefixes: ContractPrefixOption[]): { prefixId: string; number: string } {
  if (!code) return { prefixId: "", number: "" };
  for (const p of prefixes) {
    if (code.startsWith(p.prefix + "-")) {
      return { prefixId: p.id, number: code.slice(p.prefix.length + 1) };
    }
  }
  return { prefixId: "", number: "" };
}

export function EditContractDialog({ contract, contractPrefixes = [], open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [contractType, setContractType] = useState<ContractType>(contract.contractType as ContractType);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseExistingCode(contract.code, contractPrefixes);
  const [prefixId, setPrefixId] = useState(contract.prefixId ?? parsed.prefixId);
  const [contractNumber, setContractNumber] = useState(parsed.number);

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
        prefixId: prefixId || undefined,
        contractNumber: contractNumber || undefined,
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

          {contractPrefixes.length > 0 && (
            <div className="space-y-2">
              <Label>Contract Code</Label>
              <div className="flex items-center gap-0">
                <select
                  value={prefixId}
                  onChange={(e) => setPrefixId(e.target.value)}
                  className="rounded-l-md rounded-r-none border border-r-0 border-border bg-muted/50 px-3 py-2 text-[13px] text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
                >
                  <option value="">No prefix</option>
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
              {prefixId && contractNumber && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Code: {contractPrefixes.find((p) => p.id === prefixId)?.prefix}-{contractNumber}
                </p>
              )}
            </div>
          )}

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
