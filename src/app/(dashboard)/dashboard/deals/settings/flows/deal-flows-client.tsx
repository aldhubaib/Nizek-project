"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBody } from "@/components/page-body";
import {
  SettingsDataTable,
  SettingsLastModified,
} from "@/components/deals/settings-data-table";
import {
  createWorkflow,
  deleteWorkflow,
  updateWorkflow,
  type WorkflowDTO,
} from "@/actions/workflow";
import type { FormLayoutDTO } from "@/actions/custom-field";
import type { WorkflowEntityType } from "@/lib/workflow/types";
import { exclusiveLayoutChoices } from "@/lib/modules/layout-assignment";

export function DealFlowsClient({
  initial,
  layouts,
  entityType = "deal",
  projectId = "",
  basePath = "/dashboard/deals/settings",
}: {
  initial: WorkflowDTO[];
  layouts: FormLayoutDTO[];
  entityType?: WorkflowEntityType;
  projectId?: string;
  basePath?: string;
}) {
  const router = useRouter();
  const [flows, setFlows] = useState(initial);
  const [name, setName] = useState("");
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

  function create(next: string) {
    if (!next || pending) return;
    setName("");
    startPending(() =>
      run(
        () => createWorkflow({ entityType, projectId, name: next }),
        (created) => setFlows((prev) => [...prev, created]),
      ),
    );
  }

  return (
    <div>
      <PageHeader>
        <PageBackButton
          href={basePath}
          label="Back to task flow settings"
        />
        <PageName>Task flows</PageName>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </PageHeader>

      <PageBody className="space-y-6 py-6">
        {error && <p className="text-s text-destructive">{error}</p>}
        <p className="text-s text-muted-foreground">
          Each task flow is its own pipeline and picks a layout for create and
          edit. Open the blueprint to add statuses and connections.
        </p>

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New flow name"
            className="max-w-72"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              create(name.trim());
            }}
          />
          <Button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() => create(name.trim())}
          >
            <Plus className="me-1.5 h-3.5 w-3.5" />
            Create flow
          </Button>
        </div>

        <SettingsDataTable
          columns={[
            { label: "Task flow" },
            { label: "Layout" },
            { label: "Statuses" },
            { label: "Deals" },
            { label: "Last modified" },
            { label: "", className: "w-36" },
          ]}
          empty="No flows yet."
          rows={flows.map((item) => (
            <tr key={item.id} className="border-t border-border/50">
              <td className="px-4 py-3">
                <Input
                  key={item.id + item.name}
                  defaultValue={item.name}
                  className="max-w-64"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== item.name) {
                      startPending(() =>
                        run(
                          () => updateWorkflow(item.id, { name: next }),
                          (updated) =>
                            setFlows((prev) =>
                              prev.map((f) => (f.id === item.id ? updated : f)),
                            ),
                        ),
                      );
                    }
                  }}
                />
              </td>
              <td className="px-4 py-3">
                {layouts.length === 0 ? (
                  <Link
                    href={`${basePath}/layout`}
                    className="text-s text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Create a layout first
                  </Link>
                ) : (
                  <select
                    value={item.layoutId ?? ""}
                    disabled={pending}
                    onChange={(e) => {
                      const layoutId = e.target.value || null;
                      startPending(() =>
                        run(
                          () => updateWorkflow(item.id, { layoutId }),
                          (updated) =>
                            setFlows((prev) =>
                              prev.map((f) => (f.id === item.id ? updated : f)),
                            ),
                        ),
                      );
                    }}
                    className="h-8 min-w-40 rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    {!item.layoutId && <option value="">Pick a layout</option>}
                    {exclusiveLayoutChoices(layouts, flows, item.id).map(
                      (layout) => (
                        <option key={layout.id} value={layout.id}>
                          {layout.name}
                        </option>
                      ),
                    )}
                  </select>
                )}
              </td>
              <td className="px-4 py-3 text-s text-muted-foreground">
                {item.statusCount}
              </td>
              <td className="px-4 py-3 text-s text-muted-foreground">
                {item.recordCount}
              </td>
              <td className="px-4 py-3">
                <SettingsLastModified at={item.updatedAt} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`${basePath}/blueprint?flow=${item.id}`}
                    className="text-s text-muted-foreground hover:text-foreground"
                  >
                    Blueprint
                  </Link>
                  {flows.length > 1 && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (
                          !confirm(
                            `Delete the “${item.name}” flow? Its statuses and blueprint go with it.`,
                          )
                        ) {
                          return;
                        }
                        startPending(() =>
                          run(
                            () => deleteWorkflow(item.id),
                            () =>
                              setFlows((prev) =>
                                prev.filter((f) => f.id !== item.id),
                              ),
                          ),
                        );
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Delete {item.name}</span>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        />
      </PageBody>
    </div>
  );
}
