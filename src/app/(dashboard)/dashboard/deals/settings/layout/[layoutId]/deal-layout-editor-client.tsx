"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBody } from "@/components/page-body";
import { LayoutEditor } from "@/components/fields/layout-editor";
import {
  deleteFormLayout,
  updateFormLayout,
  type CustomFieldCatalogDTO,
  type FormLayoutDTO,
} from "@/actions/custom-field";
import type { WorkflowEntityType } from "@/lib/workflow/types";

export function DealLayoutEditorClient({
  layout: initialLayout,
  catalog: initialCatalog,
  canDelete,
  entityType = "deal",
  backHref = "/dashboard/deals/settings",
}: {
  layout: FormLayoutDTO;
  catalog: CustomFieldCatalogDTO;
  canDelete: boolean;
  entityType?: WorkflowEntityType;
  backHref?: string;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState(initialLayout);
  const [error, setError] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  return (
    <div>
      <PageHeader>
        <PageBackButton
          href={backHref}
          label="Back to task flow settings"
        />
        <PageName>{layout.name}</PageName>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </PageHeader>
      <PageBody className="space-y-6 py-6">
        {error && <p className="text-s text-destructive">{error}</p>}
        <p className="text-s text-muted-foreground">
          Title stays. Everything else you add yourself. Assign this layout to a
          task flow so that flow uses it.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            key={layout.id + layout.name}
            defaultValue={layout.name}
            className="max-w-72"
            aria-label="Layout name"
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (!name || name === layout.name) return;
              startPending(async () => {
                const result = await updateFormLayout(layout.id, { name });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setError(null);
                setLayout(result.data);
                router.refresh();
              });
            }}
          />
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
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
                startPending(async () => {
                  const result = await deleteFormLayout(layout.id);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.push(backHref);
                  router.refresh();
                });
              }}
            >
              <Trash2 className="me-1.5 h-3.5 w-3.5" />
              Delete layout
            </Button>
          )}
        </div>

        <LayoutEditor
          key={layout.id}
          entityType={entityType}
          initial={initialCatalog}
          onError={setError}
        />
      </PageBody>
    </div>
  );
}
