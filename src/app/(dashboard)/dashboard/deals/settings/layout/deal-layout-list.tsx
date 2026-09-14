"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBody } from "@/components/page-body";
import {
  SettingsDataTable,
  SettingsLastModified,
  SettingsRowAction,
  SettingsTableRow,
} from "@/components/deals/settings-data-table";
import {
  createFormLayout,
  deleteFormLayout,
  type FormLayoutDTO,
} from "@/actions/custom-field";

export function DealLayoutList({
  layouts: initialLayouts,
}: {
  layouts: FormLayoutDTO[];
}) {
  const router = useRouter();
  const [layouts, setLayouts] = useState(initialLayouts);
  const [newName, setNewName] = useState("");
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

  function create() {
    const name = newName.trim();
    if (!name || pending) return;
    setNewName("");
    startPending(() =>
      run(
        () => createFormLayout({ entityType: "deal", name }),
        (created) => {
          setLayouts((prev) => [...prev, created]);
          router.push(`/dashboard/deals/settings/layout/${created.id}`);
        },
      ),
    );
  }

  return (
    <div>
      <PageHeader>
        <PageBackButton
          href="/dashboard/deals/settings"
          label="Back to task flow settings"
        />
        <PageName>Layout</PageName>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </PageHeader>
      <PageBody className="space-y-6 py-6">
        {error && <p className="text-s text-destructive">{error}</p>}
        <p className="text-s text-muted-foreground">
          Each layout is a create and edit form. Built-in fields stay at the
          top. Assign a layout to a task flow so that flow uses it.
        </p>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New layout name"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              create();
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || !newName.trim()}
            onClick={create}
          >
            <Plus className="me-1.5 h-3.5 w-3.5" />
            Create layout
          </Button>
        </div>

        <SettingsDataTable
          columns={[
            { label: "Layout", className: "w-[28%]" },
            { label: "Fields", className: "w-[14%]" },
            { label: "Task flows", className: "w-[16%]" },
            { label: "Last modified", className: "w-[28%]" },
            { label: "", className: "w-[14%]" },
          ]}
          empty="Create a layout to start designing the form."
          rows={layouts.map((layout) => (
            <SettingsTableRow
              key={layout.id}
              href={`/dashboard/deals/settings/layout/${layout.id}`}
            >
              <td className="px-4 py-3.5 text-start align-middle text-s font-medium">
                {layout.name}
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
                                prev.filter((l) => l.id !== layout.id),
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
      </PageBody>
    </div>
  );
}
