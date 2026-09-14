"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBody } from "@/components/page-body";
import {
  SettingsDataTable,
  SettingsLastModified,
  SettingsRowAction,
  SettingsTableRow,
} from "@/components/deals/settings-data-table";
import { cn } from "@/lib/utils";
import {
  createWorkflow,
  deleteWorkflow,
  updateWorkflow,
  type WorkflowDTO,
} from "@/actions/workflow";
import {
  createFormLayout,
  deleteFormLayout,
  type FormLayoutDTO,
} from "@/actions/custom-field";
import type { WorkflowEntityType } from "@/lib/workflow/types";

const STATUS_FIELD = "Status";

export function DealSettingsHub({
  flows: initialFlows,
  layouts: initialLayouts,
  entityType = "deal",
  projectId = "",
  basePath = "/dashboard/deals/settings",
  backHref = "/dashboard/deals",
  backLabel = "Back to deals",
  moduleLabel = "Deals",
}: {
  flows: WorkflowDTO[];
  layouts: FormLayoutDTO[];
  entityType?: WorkflowEntityType;
  projectId?: string;
  basePath?: string;
  backHref?: string;
  backLabel?: string;
  moduleLabel?: string;
}) {
  const router = useRouter();
  const [flows, setFlows] = useState(initialFlows);
  const [layouts, setLayouts] = useState(initialLayouts);
  const [flowName, setFlowName] = useState("");
  const [layoutName, setLayoutName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  async function run<T>(
    fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    apply: (data: T) => void,
  ) {
    const result = await fn();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    apply(result.data);
    router.refresh();
  }

  function createFlow() {
    const name = flowName.trim();
    if (!name || pending) return;
    setFlowName("");
    startPending(() =>
      run(
        () => createWorkflow({ entityType, projectId, name }),
        (created) => setFlows((prev) => [...prev, created]),
      ),
    );
  }

  function createLayout() {
    const name = layoutName.trim();
    if (!name || pending) return;
    setLayoutName("");
    startPending(() =>
      run(
        () => createFormLayout({ entityType, projectId, name }),
        (created) => {
          setLayouts((prev) => [...prev, created]);
          router.push(`${basePath}/layout/${created.id}`);
        },
      ),
    );
  }

  return (
    <div>
      <PageHeader>
        <PageBackButton href={backHref} label={backLabel} />
        <PageName>Task flow settings</PageName>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </PageHeader>

      <PageBody className="space-y-12 py-8">
        {error && <p className="text-s text-destructive">{error}</p>}

        <section className="space-y-3" id="flows">
          <SectionHead title="Task flows">
            <CreateRow
              value={flowName}
              onChange={setFlowName}
              placeholder="New flow name"
              label="Create flow"
              disabled={pending}
              onSubmit={createFlow}
            />
          </SectionHead>
          <SettingsDataTable
            columns={[
              { label: "Task flow", className: "w-[24%]" },
              { label: "Module", className: "w-[16%]" },
              { label: "Layout", className: "w-[20%]" },
              { label: "Statuses", className: "w-[12%]" },
              { label: "Last modified", className: "w-[20%]" },
              { label: "", className: "w-[8%]" },
            ]}
            empty="Create a task flow to start a pipeline."
            rows={flows.map((flow) => (
              <SettingsTableRow
                key={flow.id}
                href={`${basePath}/flows`}
              >
                <td className="px-4 py-3.5 text-start align-middle text-s font-medium">
                  {flow.name}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {moduleLabel}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {flow.layoutName ?? "—"}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {flow.statusCount}
                </td>
                <td className="px-4 py-3.5 text-start align-middle">
                  <SettingsLastModified at={flow.updatedAt} />
                </td>
                <td className="px-4 py-3.5 text-start align-middle">
                  <SettingsRowAction className="flex justify-end">
                    {flows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          if (
                            !confirm(
                              `Delete the “${flow.name}” flow? Its statuses and blueprint go with it.`,
                            )
                          ) {
                            return;
                          }
                          startPending(() =>
                            run(
                              () => deleteWorkflow(flow.id),
                              () =>
                                setFlows((prev) =>
                                  prev.filter((item) => item.id !== flow.id),
                                ),
                            ),
                          );
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Delete {flow.name}</span>
                      </Button>
                    )}
                  </SettingsRowAction>
                </td>
              </SettingsTableRow>
            ))}
          />
        </section>

        <section className="space-y-3" id="blueprint">
          <SectionHead title="Blueprint" />
          <SettingsDataTable
            columns={[
              { label: "Blueprint", className: "w-[22%]" },
              { label: "Module", className: "w-[14%]" },
              { label: "Layout", className: "w-[18%]" },
              { label: "Field", className: "w-[12%]" },
              { label: "Last modified", className: "w-[20%]" },
              { label: "Status", className: "w-[14%]" },
            ]}
            empty="Create a task flow to get a blueprint."
            rows={flows.map((flow) => (
              <SettingsTableRow
                key={flow.id}
                href={`${basePath}/blueprint?flow=${flow.id}`}
              >
                <td
                  className={cn(
                    "px-4 py-3.5 text-start align-middle text-s font-medium",
                    !flow.blueprintEnabled && "text-muted-foreground",
                  )}
                >
                  {flow.name}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {moduleLabel}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {flow.layoutName ?? "—"}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {STATUS_FIELD}
                </td>
                <td className="px-4 py-3.5 text-start align-middle">
                  <SettingsLastModified at={flow.updatedAt} />
                </td>
                <td className="px-4 py-3.5 text-start align-middle">
                  <SettingsRowAction>
                    <Switch
                      checked={flow.blueprintEnabled}
                      disabled={pending}
                      aria-label={`${flow.blueprintEnabled ? "Turn off" : "Turn on"} ${flow.name}`}
                      onCheckedChange={(next) => {
                        const snapshot = flows;
                        setFlows((prev) =>
                          prev.map((item) =>
                            item.id === flow.id
                              ? { ...item, blueprintEnabled: next }
                              : item,
                          ),
                        );
                        startPending(async () => {
                          const result = await updateWorkflow(flow.id, {
                            blueprintEnabled: next,
                          });
                          if (!result.ok) {
                            setError(result.error);
                            setFlows(snapshot);
                            return;
                          }
                          setError(null);
                          setFlows((prev) =>
                            prev.map((item) =>
                              item.id === result.data.id ? result.data : item,
                            ),
                          );
                          router.refresh();
                        });
                      }}
                    />
                  </SettingsRowAction>
                </td>
              </SettingsTableRow>
            ))}
          />
        </section>

        <section className="space-y-3" id="layout">
          <SectionHead title="Layout">
            <CreateRow
              value={layoutName}
              onChange={setLayoutName}
              placeholder="New layout name"
              label="Create layout"
              disabled={pending}
              onSubmit={createLayout}
            />
          </SectionHead>
          <SettingsDataTable
            columns={[
              { label: "Layout", className: "w-[22%]" },
              { label: "Module", className: "w-[14%]" },
              { label: "Fields", className: "w-[12%]" },
              { label: "Task flows", className: "w-[14%]" },
              { label: "Last modified", className: "w-[22%]" },
              { label: "", className: "w-[16%]" },
            ]}
            empty="Create a layout to start designing the form."
            rows={layouts.map((layout) => (
              <SettingsTableRow
                key={layout.id}
                href={`${basePath}/layout/${layout.id}`}
              >
                <td className="px-4 py-3.5 text-start align-middle text-s font-medium">
                  {layout.name}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {moduleLabel}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {layout.fieldCount}
                </td>
                <td className="px-4 py-3.5 text-start align-middle text-s text-muted-foreground">
                  {layout.flowCount}
                </td>
                <td className="px-4 py-3.5 text-start align-middle">
                  <SettingsLastModified at={layout.updatedAt} />
                </td>
                <td className="px-4 py-3.5 text-start align-middle">
                  <SettingsRowAction className="flex justify-end">
                    {layouts.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          if (
                            !confirm(
                              `Delete the “${layout.name}” layout? Its fields go with it. Task flows using it will switch to another layout.`,
                            )
                          ) {
                            return;
                          }
                          startPending(() =>
                            run(
                              () => deleteFormLayout(layout.id),
                              () =>
                                setLayouts((prev) =>
                                  prev.filter((item) => item.id !== layout.id),
                                ),
                            ),
                          );
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Delete {layout.name}</span>
                      </Button>
                    )}
                  </SettingsRowAction>
                </td>
              </SettingsTableRow>
            ))}
          />
        </section>
      </PageBody>
    </div>
  );
}

function SectionHead({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="shrink-0 text-s font-medium">{title}</h2>
      {children}
    </div>
  );
}

function CreateRow({
  value,
  onChange,
  placeholder,
  label,
  disabled,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  disabled: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-48"
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          onSubmit();
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || !value.trim()}
        onClick={onSubmit}
      >
        <Plus className="me-1.5 h-3.5 w-3.5" />
        {label}
      </Button>
    </div>
  );
}
