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
import { formatRecordNumber } from "@/lib/modules/record-number";
import type { RecordDTO } from "@/lib/modules/types";
import {
  createBoardRecord,
  deleteBoardRecord,
  updateBoardRecord,
} from "@/actions/board-record";
import type { FlowDTO } from "@/lib/modules/types";
import type { CustomFieldCatalogDTO, CustomFieldDTO } from "@/actions/custom-field";
import type { WorkflowUserOption } from "@/actions/workflow";
import { FieldControl, fieldShowsOnForm } from "@/components/fields/field-control";
import { joinFormulaParts, formulaSourceValues } from "@/lib/fields/formula-config";
import { UserField } from "@/components/fields/user-field";
import { MemberAvatar } from "@/components/boards/member-avatar";
import { requiredLayoutFieldIsFilled } from "@/lib/fields/validate";
import { moduleSurface } from "@/lib/modules/registry";
import { applyTextScript } from "@/lib/fields/text-config";
import type { WorkflowEntityType } from "@/lib/workflow/types";
import { cn } from "@/lib/utils";
import {
  FULL_WORKFLOW_PERMISSIONS,
  canModifyField,
  canModifyNative,
  canWorkflow,
  type WorkflowPermissions,
} from "@/lib/workflow-permissions";
import { RecordHistoryDialog } from "@/components/modules/record-history-dialog";
import { RecordCommentSection } from "@/components/modules/record-comment-section";

export function ModuleRecordForm({
  entityType,
  projectId = "",
  record,
  flows,
  defaultFlowId,
  defaultStageId,
  catalogs,
  users,
  permissions = FULL_WORKFLOW_PERMISSIONS,
}: {
  entityType: WorkflowEntityType;
  projectId?: string;
  record: RecordDTO | null;
  flows: FlowDTO[];
  defaultFlowId?: string | null;
  defaultStageId?: string | null;
  catalogs: Record<string, CustomFieldCatalogDTO>;
  users: WorkflowUserOption[];
  permissions?: WorkflowPermissions;
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
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    record?.fieldValues ?? {},
  );
  const [assigneeId, setAssigneeId] = useState(record?.assignee?.id ?? "");
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
  const statusId = record?.stageId ?? defaultStageId ?? null;
  const canCreate = canWorkflow(permissions, "createRecord");
  const canEdit = canWorkflow(permissions, "editRecord");
  const canDelete = canWorkflow(permissions, "deleteRecord");
  const canSave = (record ? canEdit : canCreate) && allFields
    .filter((field) => fieldShowsOnForm(field, mode, fieldValues, allFields))
    .every((field) =>
      requiredLayoutFieldIsFilled(field, { title, fieldValues }),
    );

  async function persist() {
    const input = {
      title,
      flowId: record ? record.flowId : flowId,
      stageId: record ? record.stageId : (defaultStageId ?? null),
      fieldValues,
      assigneeId: assigneeId || null,
    };
    return record
      ? updateBoardRecord(projectId, record.id, input)
      : createBoardRecord(projectId, input);
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
        router.push(boardHref);
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
      const result = await deleteBoardRecord(projectId, record.id);
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
          <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" />
            <span className="flex-1">History</span>
          </DropdownMenuItem>
          {canDelete ? (
          <DropdownMenuItem
            variant="destructive"
            disabled={busy}
            onClick={remove}
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1">Delete {surface.recordWord}</span>
          </DropdownMenuItem>
          ) : null}
        </PageOverflowItems>
      )}

      <PageHeader hasMenu={Boolean(record)}>
        <PageBackButton href={boardHref} label={`Back to ${surface.label.toLowerCase()}`} />
        <PageName>
          {record
            ? `${formatRecordNumber(record.recordNumber)} ${record.title}`
            : `Add ${surface.recordWord}`}
        </PageName>
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

        {entityType === "board" && (
          <FormSection title="People" columns={2}>
            <div className="space-y-1.5">
              <Label className="text-s">Reported by</Label>
              {record?.createdBy ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-input px-2">
                  <MemberAvatar person={record.createdBy} size="sm" />
                  <span className="text-s">
                    {record.createdBy.name ?? "Someone"}
                  </span>
                </div>
              ) : (
                <p className="text-s text-muted-foreground">
                  Set to you when the card is created.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-s">Assignee</Label>
              <div
                className={
                  canModifyNative(permissions, statusId, "assignee")
                    ? undefined
                    : "pointer-events-none opacity-70"
                }
              >
                <UserField
                  multiple={false}
                  users={users}
                  value={assigneeId}
                  onChange={setAssigneeId}
                />
              </div>
            </div>
          </FormSection>
        )}

        {catalog.sections.map((section) => {
          const visible = section.fields.filter((field) =>
            fieldShowsOnForm(field, mode, fieldValues, allFields),
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
                  fieldValues={fieldValues}
                  allFields={allFields}
                  users={users}
                  projectId={projectId}
                  locked={
                    field.binding
                      ? !canModifyNative(
                          permissions,
                          statusId,
                          field.binding,
                          field.id,
                        )
                      : !canModifyField(permissions, statusId, field.id)
                  }
                  onTitle={setTitle}
                  onField={(next) =>
                    setFieldValues((prev) => ({ ...prev, [field.id]: next }))
                  }
                />
              ))}
            </FormSection>
          );
        })}
        {catalog.unsectioned.filter((field) =>
          fieldShowsOnForm(field, mode, fieldValues, allFields),
        ).length > 0 && (
          <FormSection>
            {catalog.unsectioned
              .filter((field) =>
                fieldShowsOnForm(field, mode, fieldValues, allFields),
              )
              .map((field) => (
                <CatalogField
                  key={field.id}
                  field={field}
                  title={title}
                  fieldValues={fieldValues}
                  allFields={allFields}
                  users={users}
                  projectId={projectId}
                  locked={
                    field.binding
                      ? !canModifyNative(
                          permissions,
                          statusId,
                          field.binding,
                          field.id,
                        )
                      : !canModifyField(permissions, statusId, field.id)
                  }
                  onTitle={setTitle}
                  onField={(next) =>
                    setFieldValues((prev) => ({ ...prev, [field.id]: next }))
                  }
                />
              ))}
          </FormSection>
        )}

        {error && <p className="text-s text-destructive">{error}</p>}
      </form>
      {record && entityType === "board" && projectId && (
        <div className="mx-auto mt-8 max-w-3xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Comments
          </p>
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <RecordCommentSection projectId={projectId} recordId={record.id} />
          </div>
        </div>
      )}
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

function CatalogField({
  field,
  title,
  fieldValues,
  allFields,
  users,
  projectId,
  locked,
  onTitle,
  onField,
}: {
  field: CustomFieldDTO;
  title: string;
  fieldValues: Record<string, string>;
  allFields: CustomFieldDTO[];
  users: WorkflowUserOption[];
  projectId?: string;
  locked?: boolean;
  onTitle: (next: string) => void;
  onField: (next: string) => void;
}) {
  const wide =
    field.type === "cost" || field.type === "invite" || field.type === "article"
      ? "sm:col-span-2"
      : undefined;

  if (field.binding === "title") {
    return (
      <div className={cn("space-y-1.5", wide)}>
        <Label className="text-s">
          {field.label}
          {field.required && <span className="ms-0.5 text-destructive">*</span>}
        </Label>
        <Input
          value={title}
          disabled={locked}
          lang={field.script === "arabic" ? "ar" : undefined}
          dir={field.script === "arabic" ? "rtl" : undefined}
          onChange={(e) => onTitle(applyTextScript(e.target.value, field.script))}
          placeholder="Name"
        />
      </div>
    );
  }
  return (
    <div className={wide}>
      <FieldControl
        field={field}
        value={fieldValues[field.id] ?? ""}
        users={users}
        projectId={projectId}
        locked={locked}
        preview={
          field.type === "formula"
            ? joinFormulaParts(
                field.formula?.parts ?? [],
                formulaSourceValues(allFields, title, fieldValues),
                field.formula?.separator,
              )
            : undefined
        }
        onChange={onField}
      />
    </div>
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
    <div className="rounded-xl border border-border bg-card">
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
