"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCompany, updateCompany, type CompanyDTO } from "@/actions/company";

type FormState = { name: string; website: string; notes: string };

const EMPTY_FORM: FormState = { name: "", website: "", notes: "" };

function initialForm(editing: CompanyDTO | null): FormState {
  if (!editing) return EMPTY_FORM;
  return {
    name: editing.name,
    website: editing.website ?? "",
    notes: editing.notes ?? "",
  };
}

/**
 * Seeded once per mount, so the caller has to give this a `key` that changes
 * every time it opens the dialog — that is what clears an abandoned draft and
 * loads the row being edited.
 */
export function CompanyEditorDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The company being edited, or null when adding one. */
  editing: CompanyDTO | null;
  onSaved: (company: CompanyDTO) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(editing));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        const input = {
          name: form.name,
          website: form.website,
          notes: form.notes,
        };
        const result = editing
          ? await updateCompany(editing.id, input)
          : await createCompany(input);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        onSaved(result.data);
        onOpenChange(false);
      } catch (err) {
        setError((err as Error).message || "Failed to save");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit company" : "Add company"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Holding"
              autoFocus
            />
          </Field>
          <Field label="Website (optional)">
            <Input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="acme.com"
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="How we know them, who owns the relationship…"
            />
          </Field>

          {error && <p className="text-s text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : editing ? (
              "Save"
            ) : (
              "Add"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-s">{label}</Label>
      {children}
    </div>
  );
}
