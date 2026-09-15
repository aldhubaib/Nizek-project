"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuestionField, type TaskQuestion } from "@/components/kanban/question-field";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { WorkflowUserOption } from "@/actions/workflow";
import { RelatedField } from "@/components/deals/related-records";
import type { RelatedRecordCatalog } from "@/lib/fields/relations";
import { EMPTY_RELATED_CATALOG } from "@/lib/fields/relations";
import { applyTextScript } from "@/lib/fields/text-config";
import { fieldAppliesOnForm } from "@/lib/fields/visibility";
import { PhoneField } from "@/components/fields/phone-field";
import { CountryField } from "@/components/fields/country-field";
import { PriorityField } from "@/components/fields/priority-field";
import { CostField } from "@/components/fields/cost-field";
import { UserField } from "@/components/fields/user-field";
import { InviteField } from "@/components/fields/invite-field";
import { cn } from "@/lib/utils";

export function FieldControl({
  field,
  value,
  onChange,
  users = [],
  related = EMPTY_RELATED_CATALOG,
  excludeDealId,
}: {
  field: CustomFieldDTO;
  value: string;
  onChange: (next: string) => void;
  users?: WorkflowUserOption[];
  related?: RelatedRecordCatalog;
  excludeDealId?: string;
}) {
  if (field.type === "relation") {
    return (
      <RelatedField
        field={field}
        value={value}
        options={related[field.relation?.model ?? "company"]}
        excludeId={field.relation?.model === "deal" ? excludeDealId : undefined}
        onChange={onChange}
      />
    );
  }

  const label = (
    <Label className="text-s">
      {field.label}
      {field.required && <span className="ms-0.5 text-destructive">*</span>}
    </Label>
  );

  if (field.type === "file" || field.type === "select" || field.type === "multi_select") {
    const question: TaskQuestion = {
      id: field.id,
      question: field.label,
      type: field.type === "file" ? "file" : "select",
      options: JSON.stringify(field.options),
      multiple: field.type === "multi_select",
      mandatory: field.required,
      required: field.required,
      order: field.position,
    };
    return (
      <QuestionField
        question={question}
        index={0}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <div className={field.type === "cost" || field.type === "invite" ? undefined : "space-y-1.5"}>
      {field.type !== "cost" && field.type !== "invite" && label}
      {field.type === "phone" ? (
        <PhoneField value={value} onChange={onChange} />
      ) : field.type === "cost" ? (
        <CostField label={label} value={value} onChange={onChange} />
      ) : field.type === "invite" ? (
        <div className="space-y-1.5">
          {label}
          <InviteField
            value={value}
            onChange={onChange}
            users={users}
          />
        </div>
      ) : field.type === "priority" ? (
        <PriorityField
          value={value}
          onChange={onChange}
          required={field.required}
        />
      ) : field.type === "country" ? (
        <CountryField
          value={value}
          onChange={onChange}
          multiple={field.countryMultiple}
        />
      ) : field.type === "textarea" ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "checkbox" ? (
        field.options.length > 0 ? (
          <div className="space-y-2">
            {field.options.map((option) => {
              const selected = parseCheckboxValues(value);
              return (
                <label key={option} className="flex items-center gap-2 text-s">
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => {
                      const next = selected.includes(option)
                        ? selected.filter((item) => item !== option)
                        : [...selected, option];
                      onChange(next.length ? JSON.stringify(next) : "");
                    }}
                  />
                  {option}
                </label>
              );
            })}
          </div>
        ) : (
          <label className="flex items-center gap-2 text-s">
            <input
              type="checkbox"
              checked={value === "true"}
              onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            />
            Yes
          </label>
        )
      ) : field.type === "user" ? (
        <UserField
          value={value}
          users={users}
          multiple={field.userMultiple}
          onChange={onChange}
        />
      ) : (
        <Input
          type={
            field.type === "number"
              ? "number"
              : field.type === "date"
                ? "date"
                : field.type === "email"
                  ? "email"
                    : field.type === "url"
                    ? "url"
                    : "text"
          }
          value={value}
          lang={field.script === "arabic" ? "ar" : undefined}
          dir={field.script === "arabic" ? "rtl" : undefined}
          onChange={(e) =>
            onChange(
              field.type === "text"
                ? applyTextScript(e.target.value, field.script)
                : e.target.value,
            )
          }
          className={cn(field.type === "number" && "tabular-nums")}
        />
      )}
    </div>
  );
}

function parseCheckboxValues(value: string): string[] {
  if (!value || value === "true" || value === "false") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function visibleOnForm(
  field: CustomFieldDTO,
  mode: "create" | "edit",
): boolean {
  return field.showOn === "both" || field.showOn === mode;
}

export function fieldShowsOnForm(
  field: CustomFieldDTO,
  mode: "create" | "edit",
  values: Record<string, string>,
  siblings?: Iterable<{
    id: string;
    visibility?: CustomFieldDTO["visibility"] | string | null;
  }>,
): boolean {
  const catalog = siblings ? [...siblings] : undefined;
  return fieldAppliesOnForm(
    field,
    mode,
    values,
    catalog?.map((row) => row.id),
    catalog,
  );
}
