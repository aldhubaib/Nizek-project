"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageHeaderActions } from "@/components/page-header-actions";
import { PageBody } from "@/components/page-body";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RelatedCompanies, RelatedContacts } from "@/components/deals/related-data";
import { RelatedField } from "@/components/deals/related-records";
import {
  createDeal,
  deleteDeal,
  updateDeal,
  type DealCompanyDTO,
  type DealContactDTO,
  type DealDTO,
} from "@/actions/deal";
import {
  createDirectoryRecord,
  deleteDirectoryRecord,
  updateDirectoryRecord,
  type DirectoryEntity,
} from "@/actions/module-record";
import {
  createBoardRecord,
  deleteBoardRecord,
  updateBoardRecord,
} from "@/actions/board-record";
import type { ContactOption } from "@/actions/contact";
import type { CompanyOption } from "@/actions/company";
import type { DealFlowDTO } from "@/actions/deal-flow";
import type { CustomFieldCatalogDTO, CustomFieldDTO } from "@/actions/custom-field";
import {
  EMPTY_RELATED_CATALOG,
  type RelatedRecordCatalog,
} from "@/lib/fields/relations";
import type { WorkflowUserOption } from "@/actions/workflow";
import { FieldControl, visibleOnForm } from "@/components/fields/field-control";
import { requiredLayoutFieldIsFilled } from "@/lib/fields/validate";
import { moduleSurface } from "@/lib/modules/registry";
import { applyTextScript } from "@/lib/fields/text-config";
import type { WorkflowEntityType } from "@/lib/workflow/types";
import { cn } from "@/lib/utils";
import { RecordHistoryDialog } from "@/components/modules/record-history-dialog";

export function ModuleRecordForm({
  entityType,
  projectId = "",
  record,
  contacts = [],
  companies = [],
  flows,
  defaultFlowId,
  defaultStageId,
  catalogs,
  users,
  related = EMPTY_RELATED_CATALOG,
}: {
  entityType: WorkflowEntityType;
  projectId?: string;
  record: DealDTO | null;
  contacts?: ContactOption[];
  companies?: CompanyOption[];
  flows: DealFlowDTO[];
  defaultFlowId?: string | null;
  defaultStageId?: string | null;
  catalogs: Record<string, CustomFieldCatalogDTO>;
  users: WorkflowUserOption[];
  related?: RelatedRecordCatalog;
}) {
  const router = useRouter();
  const surface = moduleSurface(entityType, projectId);
  const boardHref =
    entityType === "board" && projectId
      ? `/dashboard/projects/${projectId}?tab=boards`
      : surface.basePath;
  const [flowId, setFlowId] = useState(
    record?.flowId ?? defaultFlowId ?? flows[0]?.id ?? "",
  );
  const [title, setTitle] = useState(record?.title ?? "");
  const [value, setValue] = useState(record?.value ?? "");
  const [linkedContacts, setLinkedContacts] = useState<DealContactDTO[]>(
    record?.contacts ?? [],
  );
  const [linkedCompanies, setLinkedCompanies] = useState<DealCompanyDTO[]>(
    record?.companies ?? [],
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    record?.fieldValues ?? {},
  );
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const busy = saving || deleting;
  const selectedFlow = flows.find((f) => f.id === (record?.flowId ?? flowId));
  const catalog =
    (selectedFlow?.layoutId ? catalogs?.[selectedFlow.layoutId] : undefined) ?? {
      layoutId: null,
      sections: [],
      unsectioned: [],
    };
  const mode = record ? "edit" : "create";
  const allFields = [
    ...catalog.sections.flatMap((section) => section.fields),
    ...catalog.unsectioned,
  ];
  const canSave = allFields
    .filter((field) => visibleOnForm(field, mode))
    .every((field) =>
      requiredLayoutFieldIsFilled(field, {
        title,
        value,
        contactIds: linkedContacts.map((c) => c.id),
        companyIds: linkedCompanies.map((c) => c.id),
        fieldValues,
      }),
    );
  const relatedFields = allFields.filter(
    (field) => isRelatedLayoutField(field) && visibleOnForm(field, mode),
  );
  const showCompanies = relatedFields.some((field) => field.binding === "companies");
  const showContacts = relatedFields.some((field) => field.binding === "contacts");
  const extraRelations = relatedFields.filter((field) => !field.binding);

  async function persist() {
    const input = {
      title,
      value,
      flowId: record ? record.flowId : flowId,
      stageId: record ? record.stageId : (defaultStageId ?? null),
      contactIds: linkedContacts.map((c) => c.id),
      companyIds: linkedCompanies.map((c) => c.id),
      fieldValues,
    };
    if (entityType === "deal") {
      return record ? updateDeal(record.id, input) : createDeal(input);
    }
    if (entityType === "board") {
      return record
        ? updateBoardRecord(projectId, record.id, input)
        : createBoardRecord(projectId, input);
    }
    const directory = entityType as DirectoryEntity;
    return record
      ? updateDirectoryRecord(directory, record.id, input)
      : createDirectoryRecord(directory, input);
  }

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        const result = await persist();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(
          record?.flowId || flowId
            ? entityType === "board"
              ? boardHref
              : `${boardHref}?flow=${record?.flowId ?? flowId}`
            : boardHref,
        );
      } catch (err) {
        setError((err as Error).message || "Failed to save");
      }
    });
  }

  function remove() {
    if (!record) return;
    if (!confirm(`Delete “${record.title}”? This can't be undone.`)) return;
    setError(null);
    startDeleting(async () => {
      const result =
        entityType === "deal"
          ? await deleteDeal(record.id)
          : entityType === "board"
            ? await deleteBoardRecord(projectId, record.id)
            : await deleteDirectoryRecord(entityType as DirectoryEntity, record.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(boardHref);
    });
  }

  return (
    <div>
      <PageHeaderActions>
        {record && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
          >
            <History data-icon="inline-start" />
            History
          </Button>
        )}
        <Button
          type="submit"
          form="module-record-form"
          size="sm"
          disabled={busy || !canSave}
        >
          {saving && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
          {record ? "Save" : `Add ${surface.recordWord}`}
        </Button>
      </PageHeaderActions>
      {record && (
        <PageOverflowItems id="module-record-form-actions" order={0}>
          <DropdownMenuItem
            variant="destructive"
            disabled={busy}
            onClick={remove}
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1">Delete {surface.recordWord}</span>
          </DropdownMenuItem>
        </PageOverflowItems>
      )}

      <PageHeader hasMenu={Boolean(record)}>
        <PageBackButton href={boardHref} label={`Back to ${surface.label.toLowerCase()}`} />
        <PageName>{record ? record.title : `Add ${surface.recordWord}`}</PageName>
      </PageHeader>

      <PageBody className="py-8">
      <form
        id="module-record-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave && !busy) save();
        }}
        className="mx-auto max-w-3xl space-y-8"
      >
        {flows.length > 1 && (
          <FormSection title={surface.recordWord}>
            <div className="space-y-1.5">
              <Label className="text-s">Flow</Label>
              {record ? (
                <p className="text-s text-muted-foreground">
                  {flows.find((f) => f.id === record.flowId)?.name ?? "This flow"}
                </p>
              ) : (
                <select
                  value={flowId}
                  onChange={(e) => setFlowId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-s"
                >
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </FormSection>
        )}

        {catalog.sections.map((section) => {
          const visible = section.fields.filter(
            (field) =>
              !isRelatedLayoutField(field) && visibleOnForm(field, mode),
          );
          if (visible.length === 0) return null;
          return (
            <FormSection
              key={section.id}
              title={section.name}
              columns={section.columns}
            >
              {visible.map((field) => (
                <CatalogField
                  key={field.id}
                  field={field}
                  title={title}
                  value={value}
                  fieldValues={fieldValues}
                  users={users}
                  onTitle={setTitle}
                  onValue={setValue}
                  onField={(next) =>
                    setFieldValues((prev) => ({ ...prev, [field.id]: next }))
                  }
                />
              ))}
            </FormSection>
          );
        })}
        {catalog.unsectioned.filter(
          (field) =>
            !isRelatedLayoutField(field) && visibleOnForm(field, mode),
        ).length > 0 && (
          <FormSection>
            {catalog.unsectioned
              .filter(
                (field) =>
                  !isRelatedLayoutField(field) && visibleOnForm(field, mode),
              )
              .map((field) => (
                <CatalogField
                  key={field.id}
                  field={field}
                  title={title}
                  value={value}
                  fieldValues={fieldValues}
                  users={users}
                  onTitle={setTitle}
                  onValue={setValue}
                  onField={(next) =>
                    setFieldValues((prev) => ({ ...prev, [field.id]: next }))
                  }
                />
              ))}
          </FormSection>
        )}

        {(showCompanies || showContacts || extraRelations.length > 0) && (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Related data
            </p>
            {showCompanies && (
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
                    },
                  ])
                }
                onDetach={(id) =>
                  setLinkedCompanies((prev) => prev.filter((c) => c.id !== id))
                }
              />
            )}
            {showContacts && (
              <RelatedContacts
                attached={linkedContacts}
                options={contacts}
                onAttach={(contact) =>
                  setLinkedContacts((prev) => [...prev, contact])
                }
                onDetach={(id) =>
                  setLinkedContacts((prev) => prev.filter((c) => c.id !== id))
                }
              />
            )}
            {extraRelations.map((field) => (
              <RelatedField
                key={field.id}
                field={field}
                value={fieldValues[field.id] ?? ""}
                options={related[field.relation?.model ?? "company"]}
                excludeId={
                  field.relation?.model === "deal" ? record?.id : undefined
                }
                onChange={(next) =>
                  setFieldValues((prev) => ({ ...prev, [field.id]: next }))
                }
              />
            ))}
          </div>
        )}

        {error && <p className="text-s text-destructive">{error}</p>}
      </form>
      </PageBody>
      {record && historyOpen && (
        <RecordHistoryDialog
          entityType={entityType}
          recordId={record.id}
          recordWord={surface.recordWord}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

function isRelatedLayoutField(field: CustomFieldDTO) {
  return (
    field.binding === "companies" ||
    field.binding === "contacts" ||
    field.type === "relation"
  );
}

function CatalogField({
  field,
  title,
  value,
  fieldValues,
  users,
  onTitle,
  onValue,
  onField,
}: {
  field: CustomFieldDTO;
  title: string;
  value: string;
  fieldValues: Record<string, string>;
  users: WorkflowUserOption[];
  onTitle: (next: string) => void;
  onValue: (next: string) => void;
  onField: (next: string) => void;
}) {
  if (field.binding === "title") {
    return (
      <div className="space-y-1.5">
        <Label className="text-s">
          {field.label}
          {field.required && <span className="ms-0.5 text-destructive">*</span>}
        </Label>
        <Input
          value={title}
          lang={field.script === "arabic" ? "ar" : undefined}
          dir={field.script === "arabic" ? "rtl" : undefined}
          onChange={(e) => onTitle(applyTextScript(e.target.value, field.script))}
          placeholder="Name"
        />
      </div>
    );
  }
  if (field.binding === "value") {
    return (
      <div className="space-y-1.5">
        <Label className="text-s">
          {field.label}
          {field.required && <span className="ms-0.5 text-destructive">*</span>}
        </Label>
        <Input
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder="12,500"
          inputMode="decimal"
        />
      </div>
    );
  }
  return (
    <FieldControl
      field={field}
      value={fieldValues[field.id] ?? ""}
      users={users}
      onChange={onField}
    />
  );
}

function FormSection({
  title,
  columns = 1,
  children,
}: {
  title?: string;
  columns?: number;
  children: ReactNode;
}) {
  const two = columns === 2;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {title && (
        <div className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
      )}
      <div
        className={cn(
          title ? "border-t border-border/50 px-4 py-4" : "px-4 py-4",
          two ? "grid gap-4 sm:grid-cols-2" : "space-y-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}
