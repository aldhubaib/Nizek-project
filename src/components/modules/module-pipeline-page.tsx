"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Search, Settings2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AddButton } from "@/components/add-button";
import { PageHeader, PageName } from "@/components/page-header";
import { PageHeaderActions } from "@/components/page-header-actions";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DealBoard } from "@/components/deals/deal-board";
import { CardFieldsPicker } from "@/components/modules/card-fields-picker";
import {
  cardFieldsStorageKey,
  defaultCardFieldIds,
  defaultTableColumnIds,
  fieldPickerPrefsFromVisible,
  readFieldPickerPrefs,
  resolveCardFieldIds,
  resolveTableColumnIds,
  tableColumnsStorageKey,
  writeFieldPickerPrefs,
  type FieldPickerPrefs,
} from "@/lib/modules/card-fields";
import {
  ModuleRecordList,
  type ListSort,
} from "@/components/modules/module-record-list";
import { cn } from "@/lib/utils";
import { formatDealValue } from "@/lib/deal-value";
import {
  actionsForMove,
  allowedDestinations,
  findTransition,
  isMoveAllowed,
  missingRequiredOnSnapshot,
  moveNeedsDialog,
  requiredFieldIds,
} from "@/lib/workflow/engine";
import type { DealDTO } from "@/actions/deal";
import type { DealFlowDTO } from "@/actions/deal-flow";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { ContactOption } from "@/actions/contact";
import type { CompanyOption } from "@/actions/company";
import type { WorkflowTransitionDTO, WorkflowUserOption } from "@/actions/workflow";
import {
  EMPTY_RELATED_CATALOG,
  type RelatedRecordCatalog,
} from "@/lib/fields/relations";
import { TransitionDialog } from "@/components/workflow/transition-dialog";
import type { DuringPayload } from "@/lib/workflow/types";
import {
  createDealStage,
  deleteDealStage,
  reorderDealStages,
  updateDealStage,
  type DealStageDTO,
} from "@/actions/deal-stage";
import type { ModuleSurface } from "@/lib/modules/registry";
import { formatRecordNumber } from "@/lib/modules/record-number";

function matches(record: DealDTO, q: string) {
  if (record.title.toLowerCase().includes(q)) return true;
  const id = formatRecordNumber(record.recordNumber).toLowerCase();
  if (id === q || id.includes(q) || String(record.recordNumber) === q) {
    return true;
  }
  if (
    record.value &&
    formatDealValue(record.value).replace(/,/g, "").includes(q)
  ) {
    return true;
  }
  if (record.companies.some((c) => c.nameEn.toLowerCase().includes(q))) {
    return true;
  }
  if (
    record.contacts.some((c) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q),
    )
  ) {
    return true;
  }
  return Object.values(record.fieldValues ?? {}).some((value) =>
    value.toLowerCase().includes(q),
  );
}

export function ModulePipelinePage({
  surface,
  flows,
  flowId,
  records: initialRecords,
  stages: initialStages,
  transitions,
  fields,
  users,
  contacts = [],
  companies = [],
  related = EMPTY_RELATED_CATALOG,
  onMove,
  onFlowChange,
}: {
  surface: ModuleSurface;
  flows: DealFlowDTO[];
  flowId: string | null;
  records: DealDTO[];
  stages: DealStageDTO[];
  transitions: WorkflowTransitionDTO[];
  fields: CustomFieldDTO[];
  users: WorkflowUserOption[];
  contacts?: ContactOption[];
  companies?: CompanyOption[];
  related?: RelatedRecordCatalog;
  onMove: (
    id: string,
    stageId: string | null,
    payload?: DuringPayload,
  ) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  onFlowChange?: (flowId: string) => void;
}) {
  const router = useRouter();
  const viewKey = `module-view:${surface.entityType}:${surface.projectId ?? ""}`;
  const sortKey = `module-sort:${surface.entityType}:${surface.projectId ?? ""}`;
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [sort, setSort] = useState<ListSort>({ key: "title", dir: "asc" });
  const cardFieldsKey = cardFieldsStorageKey(
    surface.entityType,
    surface.projectId ?? "",
  );
  const tableColumnsKey = tableColumnsStorageKey(
    surface.entityType,
    surface.projectId ?? "",
  );
  const [savedCardFields, setSavedCardFields] =
    useState<FieldPickerPrefs | null>(null);
  const [savedTableColumns, setSavedTableColumns] =
    useState<FieldPickerPrefs | null>(null);
  const [records, setRecords] = useState(initialRecords);
  const [stages, setStages] = useState(initialStages);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    deal: DealDTO;
    stageId: string;
    during: ReturnType<typeof actionsForMove>["during"];
    fromName: string;
    toName: string;
  } | null>(null);

  const pending = useRef(0);
  useEffect(() => {
    const savedView = window.localStorage.getItem(viewKey);
    if (savedView === "list" || savedView === "kanban") setView(savedView);
    try {
      const savedSort = JSON.parse(
        window.localStorage.getItem(sortKey) ?? "",
      ) as ListSort;
      if (
        savedSort &&
        typeof savedSort.key === "string" &&
        (savedSort.dir === "asc" || savedSort.dir === "desc")
      ) {
        setSort(savedSort);
      }
    } catch {
      /* keep default */
    }
    const cards = readFieldPickerPrefs(cardFieldsKey);
    const columns = readFieldPickerPrefs(tableColumnsKey);
    if (cards && cards.seen.length === 0) {
      const next = fieldPickerPrefsFromVisible(
        cards.visible,
        defaultCardFieldIds(fields),
      );
      writeFieldPickerPrefs(cardFieldsKey, next);
      setSavedCardFields(next);
    } else {
      setSavedCardFields(cards);
    }
    if (columns && columns.seen.length === 0) {
      const next = fieldPickerPrefsFromVisible(
        columns.visible,
        defaultTableColumnIds(fields),
      );
      writeFieldPickerPrefs(tableColumnsKey, next);
      setSavedTableColumns(next);
    } else {
      setSavedTableColumns(columns);
    }
  }, [viewKey, sortKey, cardFieldsKey, tableColumnsKey, fields]);
  useEffect(() => {
    if (pending.current > 0) return;
    setRecords(initialRecords);
  }, [initialRecords]);
  useEffect(() => {
    if (pending.current > 0) return;
    setStages(initialStages);
  }, [initialStages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((row) => matches(row, q));
  }, [records, query]);

  const fieldLookup = useMemo(
    () =>
      fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        visibility: f.visibility,
      })),
    [fields],
  );
  const visibleCardFieldIds = useMemo(
    () => resolveCardFieldIds(fields, savedCardFields),
    [fields, savedCardFields],
  );
  const visibleTableColumnIds = useMemo(
    () => resolveTableColumnIds(fields, savedTableColumns),
    [fields, savedTableColumns],
  );
  const cardDisplay = useMemo(
    () => ({
      fields,
      visibleFieldIds: visibleCardFieldIds,
      ctx: { users, related, fields },
    }),
    [fields, visibleCardFieldIds, users, related],
  );

  async function commit<T>(
    run: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    rollback: () => void,
  ) {
    pending.current += 1;
    try {
      const result = await run();
      if (!result.ok) {
        rollback();
        setError(result.error);
        return null;
      }
      setError(null);
      return result.data;
    } catch (err) {
      rollback();
      setError((err as Error).message || "Something went wrong");
      return null;
    } finally {
      pending.current -= 1;
      if (!surface.embedded) router.refresh();
    }
  }

  function snapshotOf(deal: DealDTO) {
    return {
      native: {
        title: deal.title,
        value: deal.value,
        contactIds: deal.contacts.map((c) => c.id),
        companyIds: deal.companies.map((c) => c.id),
      },
      custom: deal.fieldValues ?? {},
    };
  }

  function applyMove(id: string, stageId: string | null, payload?: DuringPayload) {
    const before = records;
    setRecords((prev) =>
      prev.map((row) => (row.id === id ? { ...row, stageId } : row)),
    );
    void commit(() => onMove(id, stageId, payload), () => setRecords(before));
  }

  function moveRecord(id: string, stageId: string | null) {
    const record = records.find((row) => row.id === id);
    if (!record) return;

    const allowed = isMoveAllowed({
      fromStatusId: record.stageId,
      toStatusId: stageId,
      transitionCount: transitions.length,
      allowedToIds: allowedDestinations(record.stageId, transitions),
      enabled: flows.find((f) => f.id === flowId)?.blueprintEnabled,
    });
    if (!allowed) {
      setError("The blueprint does not allow that move");
      return;
    }

    const blueprintOn =
      flows.find((f) => f.id === flowId)?.blueprintEnabled !== false;

    if (blueprintOn && record.stageId && stageId && record.stageId !== stageId) {
      const from = stages.find((s) => s.id === record.stageId);
      const to = stages.find((s) => s.id === stageId);
      const transition = findTransition(record.stageId, stageId, transitions);
      const grouped = actionsForMove({
        fromActions: from?.actions ?? [],
        toActions: to?.actions ?? [],
        transition,
      });
      const required = [
        ...requiredFieldIds(grouped.before),
        ...requiredFieldIds(grouped.during),
        ...(from?.requiredFields ?? []),
        ...(to?.requiredFields ?? []),
      ];
      const uniqueRequired = [...new Set(required)];
      const missing = missingRequiredOnSnapshot(
        snapshotOf(record),
        uniqueRequired,
        fieldLookup,
      );
      const during =
        uniqueRequired.length > 0 &&
        !grouped.during.some((a) => a.type === "require_fields")
          ? [
              {
                id: "required-fields",
                hook: "during" as const,
                type: "require_fields" as const,
                config: { fields: uniqueRequired },
                position: 0,
              },
              ...grouped.during,
            ]
          : grouped.during;
      if (missing.length > 0 || moveNeedsDialog(during)) {
        setPendingMove({
          deal: record,
          stageId,
          during,
          fromName: from?.name ?? "this status",
          toName: to?.name ?? "Unassigned",
        });
        return;
      }
    }

    applyMove(id, stageId);
  }

  function reorderStages(orderedIds: string[]) {
    if (!flowId) return;
    const before = stages;
    const byId = new Map(stages.map((s) => [s.id, s]));
    setStages(
      orderedIds
        .map((id) => byId.get(id))
        .filter((s): s is DealStageDTO => Boolean(s)),
    );
    void commit(
      () => reorderDealStages(flowId, orderedIds),
      () => setStages(before),
    );
  }

  async function addStage(name: string) {
    if (!flowId) return;
    const created = await commit(
      () => createDealStage({ flowId, name }),
      () => {},
    );
    if (created) setStages((prev) => [...prev, created]);
  }

  async function renameStage(
    stage: DealStageDTO,
    next: { name: string; color: string },
  ) {
    const before = stages;
    setStages((prev) =>
      prev.map((s) => (s.id === stage.id ? { ...s, ...next } : s)),
    );
    await commit(
      () => updateDealStage(stage.id, next),
      () => setStages(before),
    );
  }

  async function removeStage(stage: DealStageDTO) {
    const held = records.filter((row) => row.stageId === stage.id).length;
    const warning = held
      ? ` Its ${held} ${surface.recordWord}${held === 1 ? "" : "s"} will move to Unassigned.`
      : "";
    if (!confirm(`Delete the “${stage.name}” column?${warning}`)) return;

    const beforeStages = stages;
    const beforeRecords = records;
    setStages((prev) => prev.filter((s) => s.id !== stage.id));
    setRecords((prev) =>
      prev.map((row) =>
        row.stageId === stage.id ? { ...row, stageId: null } : row,
      ),
    );
    await commit(
      () => deleteDealStage(stage.id),
      () => {
        setStages(beforeStages);
        setRecords(beforeRecords);
      },
    );
  }

  const newHref = flowId
    ? `${surface.entityType === "board" && surface.projectId
        ? `/dashboard/projects/${surface.projectId}/board/new`
        : `${surface.basePath}/new`}?flow=${flowId}`
    : surface.entityType === "board" && surface.projectId
      ? `/dashboard/projects/${surface.projectId}/board/new`
      : `${surface.basePath}/new`;

  const openHref = (id: string) =>
    surface.entityType === "board" && surface.projectId
      ? `/dashboard/projects/${surface.projectId}/board/${id}`
      : `${surface.basePath}/${id}`;

  const addControl = (
    <AddButton
      label={`Add ${surface.recordWord}`}
      onClick={() => router.push(newHref)}
    />
  );

  function changeView(next: "kanban" | "list") {
    setView(next);
    window.localStorage.setItem(viewKey, next);
  }

  function changeSort(next: ListSort) {
    setSort(next);
    window.localStorage.setItem(sortKey, JSON.stringify(next));
  }

  function changeCardFields(ids: string[]) {
    const next = fieldPickerPrefsFromVisible(ids, defaultCardFieldIds(fields));
    setSavedCardFields(next);
    writeFieldPickerPrefs(cardFieldsKey, next);
  }

  function changeTableColumns(ids: string[]) {
    const next = fieldPickerPrefsFromVisible(ids, defaultTableColumnIds(fields));
    setSavedTableColumns(next);
    writeFieldPickerPrefs(tableColumnsKey, next);
  }

  const viewToggle = (
    <div className="flex h-9 overflow-hidden rounded-md border border-border">
      <button
        type="button"
        aria-label="Board view"
        aria-pressed={view === "kanban"}
        onClick={() => changeView("kanban")}
        className={cn(
          "grid size-9 place-items-center",
          view === "kanban"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="List view"
        aria-pressed={view === "list"}
        onClick={() => changeView("list")}
        className={cn(
          "grid size-9 place-items-center",
          view === "list"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="size-3.5" />
      </button>
    </div>
  );

  return (
    <div
      className={
        surface.embedded
          ? "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
          : "flex h-dvh min-h-0 flex-col overflow-hidden"
      }
    >
      <PageOverflowItems id={`${surface.entityType}-settings`} order={90}>
        <DropdownMenuItem onClick={() => router.push(surface.settingsPath)}>
          <Settings2 className="h-4 w-4" />
          <span className="flex-1">Task flow settings</span>
        </DropdownMenuItem>
      </PageOverflowItems>

      {surface.embedded ? (
        <PageHeaderActions>{addControl}</PageHeaderActions>
      ) : (
        <PageHeader className="justify-between">
          <PageName>{surface.label}</PageName>
          {addControl}
        </PageHeader>
      )}

      <div
        className={
          surface.embedded
            ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
            : "flex min-h-0 flex-1 flex-col gap-3 px-app py-4"
        }
      >
        {error && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="flex-1 text-s text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss"
              className="text-destructive/60 hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {flows.length > 1 && (
            <select
              value={flowId ?? ""}
              onChange={(e) => {
                if (onFlowChange) onFlowChange(e.target.value);
                else router.push(`${surface.basePath}?flow=${e.target.value}`);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-s"
            >
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <div className="relative max-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${surface.label.toLowerCase()}`}
              className="h-9 ps-8 text-s"
            />
          </div>
          {viewToggle}
          <CardFieldsPicker
            mode={view === "list" ? "table" : "card"}
            fields={fields}
            visibleIds={
              view === "list" ? visibleTableColumnIds : visibleCardFieldIds
            }
            onChange={view === "list" ? changeTableColumns : changeCardFields}
          />
        </div>

        {view === "list" ? (
          <ModuleRecordList
            records={filtered}
            stages={stages}
            fields={fields}
            sort={sort}
            onSort={changeSort}
            onOpen={(record) => router.push(openHref(record.id))}
            empty={`No ${surface.recordWord}s`}
            ctx={{ users, related, fields }}
            visibleColumnIds={visibleTableColumnIds}
          />
        ) : (
          <DealBoard
            stages={stages}
            deals={filtered}
            emptyLabel={`No ${surface.recordWord}s`}
            cardDisplay={cardDisplay}
            onMoveDeal={moveRecord}
            onReorderStages={reorderStages}
            onAddStage={addStage}
            onRenameStage={renameStage}
            onDeleteStage={removeStage}
            onOpenDeal={(record) => router.push(openHref(record.id))}
          />
        )}
      </div>

      {pendingMove && (
        <TransitionDialog
          open
          deal={pendingMove.deal}
          fromName={pendingMove.fromName}
          toName={pendingMove.toName}
          during={pendingMove.during}
          fields={fields}
          users={users}
          contacts={contacts}
          companies={companies}
          related={related}
          onClose={() => setPendingMove(null)}
          onConfirm={(payload) => {
            const move = pendingMove;
            setPendingMove(null);
            applyMove(move.deal.id, move.stageId, payload);
          }}
        />
      )}
    </div>
  );
}
