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
import { PhoneField } from "@/components/contacts/phone-field";
import { createContact, updateContact, type ContactDTO } from "@/actions/contact";
import { createCompany, type CompanyOption } from "@/actions/company";
import { DEFAULT_DIAL_COUNTRY } from "@/lib/dial-codes";

/** Sentinel for the company dropdown's "create one now" row. */
const NEW_COMPANY = "__new";

type FormState = {
  firstName: string;
  lastName: string;
  phoneCountry: string;
  phoneNumber: string;
  email: string;
  role: string;
  companyId: string;
  newCompanyName: string;
  /** Which board column the contact lands in. Not shown; set by the caller. */
  stageId: string | null;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  phoneCountry: DEFAULT_DIAL_COUNTRY,
  phoneNumber: "",
  email: "",
  role: "",
  companyId: "",
  newCompanyName: "",
  stageId: null,
};

function initialForm(
  editing: ContactDTO | null,
  defaultStageId: string | null,
): FormState {
  if (!editing) return { ...EMPTY_FORM, stageId: defaultStageId };
  return {
    firstName: editing.firstName,
    lastName: editing.lastName,
    phoneCountry: editing.phoneCountry,
    phoneNumber: editing.phoneNumber,
    email: editing.email ?? "",
    role: editing.role ?? "",
    companyId: editing.companyId ?? "",
    newCompanyName: "",
    // Editing never moves the contact: the board is where that happens.
    stageId: editing.stageId,
  };
}

/**
 * Seeded once per mount, so the caller has to give this a `key` that changes
 * every time it opens the dialog — that is what clears an abandoned draft and
 * loads the row being edited. Keying on the contact id alone is not enough:
 * reopening the same row would keep the edits that were cancelled.
 */
export function ContactEditorDialog({
  open,
  onOpenChange,
  editing,
  companies,
  defaultStageId,
  onSaved,
  onCompanyCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The contact being edited, or null when adding one. */
  editing: ContactDTO | null;
  companies: CompanyOption[];
  /** Column a newly added contact lands in — the one its "+" was clicked on. */
  defaultStageId?: string | null;
  onSaved: (contact: ContactDTO) => void;
  onCompanyCreated: (company: CompanyOption) => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    initialForm(editing, defaultStageId ?? null),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const addingCompany = form.companyId === NEW_COMPANY;
  const canSave =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.phoneNumber.trim().length > 0 &&
    (!addingCompany || form.newCompanyName.trim().length > 0);

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        // A brand-new company has to exist before the contact can point at it.
        let companyId = addingCompany ? "" : form.companyId;
        if (addingCompany) {
          const company = await createCompany({ name: form.newCompanyName });
          if (!company.ok) {
            setError(company.error);
            return;
          }
          companyId = company.data.id;
          onCompanyCreated({ id: company.data.id, name: company.data.name });
        }

        const input = {
          firstName: form.firstName,
          lastName: form.lastName,
          phoneCountry: form.phoneCountry,
          phoneNumber: form.phoneNumber,
          email: form.email,
          role: form.role,
          companyId,
          stageId: form.stageId,
        };

        const result = editing
          ? await updateContact(editing.id, input)
          : await createContact(input);

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
          <DialogTitle>{editing ? "Edit contact" : "Add contact"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Layla"
                autoComplete="given-name"
              />
            </Field>
            <Field label="Last name">
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Al-Sabah"
                autoComplete="family-name"
              />
            </Field>
          </div>

          <Field label="Phone">
            <PhoneField
              country={form.phoneCountry}
              number={form.phoneNumber}
              onCountryChange={(code) =>
                setForm((f) => ({ ...f, phoneCountry: code }))
              }
              onNumberChange={(value) =>
                setForm((f) => ({ ...f, phoneNumber: value }))
              }
            />
          </Field>

          <Field label="Email (optional)">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="layla@example.com"
              autoComplete="email"
            />
          </Field>

          <Field label="Company (optional)">
            <select
              value={form.companyId}
              onChange={(e) =>
                setForm({
                  ...form,
                  companyId: e.target.value,
                  newCompanyName: "",
                })
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-s"
            >
              <option value="">No company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_COMPANY}>+ Add a new company…</option>
            </select>
          </Field>

          {addingCompany && (
            <Field label="New company name">
              <Input
                value={form.newCompanyName}
                onChange={(e) =>
                  setForm({ ...form, newCompanyName: e.target.value })
                }
                placeholder="Acme Holding"
                autoFocus
              />
            </Field>
          )}

          <Field label="Role (optional)">
            <Input
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="Head of Marketing"
              autoComplete="organization-title"
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
          <Button onClick={save} disabled={saving || !canSave}>
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
