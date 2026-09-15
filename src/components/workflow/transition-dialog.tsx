"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldControl } from "@/components/fields/field-control";
import { RelatedCompanies, RelatedContacts } from "@/components/deals/related-data";
import { configItems, configText } from "@/lib/workflow/actions";
import {
  requiredFieldIds,
  shownFieldIds,
  unfilledFieldIds,
  validateDuring,
} from "@/lib/workflow/engine";
import { isCustomFieldType, NATIVE_DEAL_FIELDS } from "@/lib/fields/types";
import { formatDealValue } from "@/lib/deal-value";
import { formatRecordNumber } from "@/lib/modules/record-number";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { DealCompanyDTO, DealContactDTO, DealDTO } from "@/actions/deal";
import type { ContactOption } from "@/actions/contact";
import type { CompanyOption } from "@/actions/company";
import type { WorkflowUserOption } from "@/actions/workflow";
import type { DuringPayload, WorkflowActionDef } from "@/lib/workflow/types";
import {
  EMPTY_RELATED_CATALOG,
  type RelatedRecordCatalog,
} from "@/lib/fields/relations";
import { fieldIsLogicallyVisible } from "@/lib/fields/visibility";

export function TransitionDialog({
  open,
  deal,
  fromName,
  toName,
  during,
  fields,
  users,
  contacts,
  companies,
  related = EMPTY_RELATED_CATALOG,
  onClose,
  onConfirm,
}: {
  open: boolean;
  deal: DealDTO;
  fromName: string;
  toName: string;
  during: WorkflowActionDef[];
  fields: CustomFieldDTO[];
  users: WorkflowUserOption[];
  contacts: ContactOption[];
  companies: CompanyOption[];
  related?: RelatedRecordCatalog;
  onClose: () => void;
  onConfirm: (payload: DuringPayload) => void;
}) {
  const snapshot = useMemo(
    () => ({
      native: {
        title: deal.title,
        value: deal.value,
        contactIds: deal.contacts.map((c) => c.id),
        companyIds: deal.companies.map((c) => c.id),
      },
      custom: deal.fieldValues ?? {},
    }),
    [deal],
  );
  const fieldLookup = useMemo(
    () =>
      fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: isCustomFieldType(f.type) ? f.type : ("text" as const),
        visibility: f.visibility,
      })),
    [fields],
  );
  const requiredIds = useMemo(
    () => unfilledFieldIds(requiredFieldIds(during), snapshot, fieldLookup),
    [during, snapshot, fieldLookup],
  );
  const shownIds = useMemo(
    () => unfilledFieldIds(shownFieldIds(during), snapshot, fieldLookup),
    [during, snapshot, fieldLookup],
  );
  const customShown = fields.filter(
    (f) =>
      !f.binding &&
      (shownIds.includes(f.id) || shownIds.includes(f.binding ?? "")),
  );
  const showValue = shownIds.includes("value");
  const showTitle = shownIds.includes("title");
  const contactsFilled = snapshot.native.contactIds.length > 0;
  const companiesFilled = snapshot.native.companyIds.length > 0;
  const showContacts =
    !contactsFilled &&
    (shownIds.includes("contacts") ||
      during.some((a) => a.type === "associate_contacts"));
  const showCompanies =
    !companiesFilled &&
    (shownIds.includes("companies") ||
      during.some((a) => a.type === "associate_companies"));
  const messages = during.filter((a) => a.type === "message");
  const checklists = during.filter((a) => a.type === "checklist");
  const requiredLabels = requiredIds.map((id) => {
    const fromLayout = fields.find((f) => f.binding === id || f.id === id);
    if (fromLayout) return fromLayout.label;
    const native = NATIVE_DEAL_FIELDS.find((f) => f.id === id);
    if (native) return native.label;
    return id;
  });

  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(deal.value ?? "");
  const [customValues, setCustomValues] = useState<Record<string, string>>(
    deal.fieldValues ?? {},
  );
  const [linkedContacts, setLinkedContacts] = useState(deal.contacts);
  const [linkedCompanies, setLinkedCompanies] = useState(deal.companies);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function confirm() {
    const payload: DuringPayload = {
      customValues,
      checklist,
      nativePatches: {
        title: showTitle ? title : undefined,
        value: showValue ? value : undefined,
        contactIds: showContacts ? linkedContacts.map((c) => c.id) : undefined,
        companyIds: showCompanies ? linkedCompanies.map((c) => c.id) : undefined,
      },
    };
    const issues = validateDuring(during, snapshot, payload, fieldLookup);
    if (issues.length > 0) {
      setError(issues.join(". "));
      return;
    }
    setError(null);
    onConfirm(payload);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[900] bg-overlay backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed top-1/2 left-1/2 z-[901] w-full max-w-md -translate-x-1/2 -translate-y-1/2">
        <div className="overflow-hidden rounded-xl border border-destructive/30 bg-card shadow-2xl">
          <div className="px-5 pt-5 pb-4">
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Move to {toName}
                </div>
                <p className="text-s leading-relaxed break-words text-muted-foreground">
                  {requiredLabels.length > 0 ? (
                    <>
                      This deal cannot leave{" "}
                      <span className="font-medium text-foreground">{fromName}</span>{" "}
                      until{" "}
                      <span className="font-medium text-foreground">
                        {listFields(requiredLabels)}
                      </span>{" "}
                      {requiredLabels.length === 1 ? "is" : "are"} filled in.
                    </>
                  ) : (
                    <>
                      Confirm the move from{" "}
                      <span className="font-medium text-foreground">{fromName}</span>{" "}
                      to{" "}
                      <span className="font-medium text-foreground">{toName}</span>.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mb-4 flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {formatRecordNumber(deal.recordNumber)}
              </span>
              <span className="min-w-0 flex-1 truncate text-s">{deal.title}</span>
              {deal.value && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDealValue(deal.value)}
                </span>
              )}
            </div>

            <div className="space-y-4">
              {error && <p className="text-s text-destructive">{error}</p>}
              {messages.map((action) => (
                <p key={action.id} className="text-s text-muted-foreground">
                  {configText(action.config)}
                </p>
              ))}
              {showTitle && (
                <FieldBlock label="Title" required={requiredIds.includes("title")}>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </FieldBlock>
              )}
              {showValue && (
                <FieldBlock label="Value" required={requiredIds.includes("value")}>
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode="decimal"
                    placeholder="Amount"
                  />
                </FieldBlock>
              )}
              {customShown
                .filter((field) =>
                  fieldIsLogicallyVisible(
                    field,
                    customValues,
                    fields.map((row) => row.id),
                    fields,
                  ),
                )
                .map((field) =>
                field.type === "relation" ? (
                  <FieldControl
                    key={field.id}
                    field={field}
                    value={customValues[field.id] ?? ""}
                    users={users}
                    related={related}
                    excludeDealId={deal.id}
                    onChange={(next) =>
                      setCustomValues((prev) => ({ ...prev, [field.id]: next }))
                    }
                  />
                ) : (
                  <FieldBlock
                    key={field.id}
                    label={field.label}
                    required={requiredIds.includes(field.id)}
                  >
                    <FieldControl
                      field={field}
                      value={customValues[field.id] ?? ""}
                      users={users}
                      related={related}
                      onChange={(next) =>
                        setCustomValues((prev) => ({ ...prev, [field.id]: next }))
                      }
                    />
                  </FieldBlock>
                ),
              )}
              {checklists.map((action) => (
                <div key={action.id} className="space-y-1.5">
                  {configItems(action.config).map((item) => (
                    <label key={item} className="flex items-center gap-2 text-s">
                      <input
                        type="checkbox"
                        checked={Boolean(checklist[item])}
                        onChange={(e) =>
                          setChecklist((prev) => ({
                            ...prev,
                            [item]: e.target.checked,
                          }))
                        }
                      />
                      {item}
                    </label>
                  ))}
                </div>
              ))}
              {showCompanies && (
                <FieldBlock
                  label="Companies"
                  required={requiredIds.includes("companies")}
                >
                  <RelatedCompanies
                    attached={linkedCompanies}
                    options={companies}
                    onAttach={(company) =>
                      setLinkedCompanies((prev) => [
                        ...prev,
                        {
                          id: company.id,
                          nameEn: company.name,
                          nameAr: "",
                          website: company.website,
                          industry: company.industry,
                        } satisfies DealCompanyDTO,
                      ])
                    }
                    onDetach={(id) =>
                      setLinkedCompanies((prev) => prev.filter((c) => c.id !== id))
                    }
                  />
                </FieldBlock>
              )}
              {showContacts && (
                <FieldBlock
                  label="Contacts"
                  required={requiredIds.includes("contacts")}
                >
                  <RelatedContacts
                    attached={linkedContacts}
                    options={contacts}
                    onAttach={(contact: ContactOption) =>
                      setLinkedContacts((prev) => [...prev, contact as DealContactDTO])
                    }
                    onDetach={(id) =>
                      setLinkedContacts((prev) => prev.filter((c) => c.id !== id))
                    }
                  />
                </FieldBlock>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirm}>
              {toName ? `Move to ${toName}` : "Move"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function FieldBlock({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function listFields(fields: string[]): string {
  if (fields.length === 1) return fields[0];
  return `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]}`;
}
