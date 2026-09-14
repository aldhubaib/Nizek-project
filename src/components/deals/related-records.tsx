"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  Contact,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  AttachPicker,
  RelatedCard,
  UnlinkButton,
} from "@/components/deals/related-data";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { RelatedRecordOption } from "@/lib/fields/relations";
import {
  RELATION_MODEL_LABEL,
  parseRelationIds,
  stringifyRelationIds,
  type RelationModel,
} from "@/lib/fields/relations";

const MODEL_ICON: Record<RelationModel, LucideIcon> = {
  company: Building2,
  contact: Contact,
  deal: Briefcase,
  user: User,
};

export function RelatedField({
  field,
  value,
  options,
  excludeId,
  onChange,
}: {
  field: CustomFieldDTO;
  value: string;
  options: RelatedRecordOption[];
  excludeId?: string;
  onChange: (next: string) => void;
}) {
  const model = field.relation?.model ?? "company";
  const multiple = field.relation?.multiple ?? true;
  const attachedIds = parseRelationIds(value);
  const catalog = useMemo(
    () => options.filter((row) => row.id !== excludeId),
    [options, excludeId],
  );
  const attached = attachedIds.map((id) => {
    const row = catalog.find((item) => item.id === id);
    return (
      row ?? {
        id,
        title: "No longer available",
        subtitle: "",
        href: "",
      }
    );
  });
  const attachedSet = new Set(attached.map((row) => row.id));
  const available = catalog.filter((row) => !attachedSet.has(row.id));
  const canAdd = multiple || attached.length === 0;
  const modelLabel = RELATION_MODEL_LABEL[model];

  return (
    <RelatedCard
      title={field.label}
      icon={MODEL_ICON[model]}
      empty={attached.length === 0}
      picker={
        canAdd ? (
          <AttachPicker
            label={`Add a ${modelLabel.toLowerCase()}`}
            empty={`No ${modelLabel.toLowerCase()}s left to add`}
            items={available.map((row) => ({
              id: row.id,
              title: row.title,
              subtitle: row.subtitle,
            }))}
            onPick={(id) => {
              const next = multiple ? [...attachedIds, id] : [id];
              onChange(stringifyRelationIds(next));
            }}
          />
        ) : undefined
      }
    >
      <table className="w-full text-start">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Detail</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {attached.map((row) => (
            <tr key={row.id} className="border-t border-border/50">
              <td className="px-4 py-2.5">
                {row.href ? (
                  <Link
                    href={row.href}
                    className="text-s font-medium hover:underline"
                  >
                    {row.title}
                  </Link>
                ) : (
                  <span className="text-s font-medium">{row.title}</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-s text-muted-foreground">
                {row.subtitle || "—"}
              </td>
              <td className="px-2 py-2.5">
                <UnlinkButton
                  label={`Remove ${row.title}`}
                  onClick={() =>
                    onChange(
                      stringifyRelationIds(
                        attachedIds.filter((id) => id !== row.id),
                      ),
                    )
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RelatedCard>
  );
}
