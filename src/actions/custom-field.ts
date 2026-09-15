"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { requireProjectMember, requireUser } from "@/lib/auth";
import { planReorder, positionBetween } from "@/lib/board-order";
import {
  isCustomFieldType,
  isFieldShowOn,
  parseFieldOptions,
  type CustomFieldType,
  type FieldShowOn,
} from "@/lib/fields/types";
import {
  DEFAULT_RELATION,
  parseRelationConfig,
  stringifyRelationConfig,
  type RelationConfig,
} from "@/lib/fields/relations";
import {
  applyTextScript,
  parseTextConfig,
  stringifyTextConfig,
  type TextScript,
} from "@/lib/fields/text-config";
import {
  parseFieldVisibility,
  stringifyFieldVisibility,
  type FieldVisibility,
} from "@/lib/fields/visibility";
import {
  parseUserConfig,
  stringifyUserConfig,
} from "@/lib/fields/user-config";
import {
  parseCountryConfig,
  stringifyCountryConfig,
} from "@/lib/fields/country-config";
import {
  parseUrlConfig,
  stringifyUrlConfig,
  type UrlIconId,
} from "@/lib/fields/url-config";
import type { WorkflowEntityType } from "@/lib/workflow/types";
import { getModule, moduleBinding, projectBoardPaths } from "@/lib/modules/registry";

export type CustomFieldDTO = {
  id: string;
  entityType: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  relation: RelationConfig | null;
  script: TextScript | null;
  binding: string | null;
  required: boolean;
  showOn: FieldShowOn;
  visibility: FieldVisibility | null;
  userMultiple: boolean;
  countryMultiple: boolean;
  urlIcon: UrlIconId | null;
  sectionId: string | null;
  position: number;
};

export type CustomFieldSectionDTO = {
  id: string;
  entityType: string;
  name: string;
  position: number;
  columns: number;
  fields: CustomFieldDTO[];
};

export type CustomFieldCatalogDTO = {
  layoutId: string | null;
  sections: CustomFieldSectionDTO[];
  unsectioned: CustomFieldDTO[];
};

export type FormLayoutDTO = {
  id: string;
  entityType: string;
  name: string;
  position: number;
  fieldCount: number;
  flowCount: number;
  updatedAt: string;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_LABEL = 80;

async function fieldAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[custom-field:${label}]`, err);
    return { ok: false, error };
  }
}

function revalidate(entityType: string, projectId = "") {
  if (entityType === "board" && projectId) {
    for (const path of projectBoardPaths(projectId)) revalidatePath(path);
    return;
  }
  for (const path of getModule(entityType).revalidatePaths) {
    if (path.endsWith("/layout")) revalidatePath(path, "layout");
    else revalidatePath(path);
  }
}

async function requireFieldModuleAccess(entityType: string, projectId = "") {
  if (entityType === "board") {
    if (!projectId) throw new Error("Open this from a project");
    await requireProjectMember(projectId);
    return;
  }
  await requireContactsAccess();
}

function toLayoutDTO(
  row: {
    id: string;
    entityType: string;
    name: string;
    position: number;
    updatedAt: Date;
    _count?: { fields: number; workflows: number };
  },
  counts?: { fieldCount: number; flowCount: number },
): FormLayoutDTO {
  return {
    id: row.id,
    entityType: row.entityType,
    name: row.name,
    position: row.position,
    fieldCount: counts?.fieldCount ?? row._count?.fields ?? 0,
    flowCount: counts?.flowCount ?? row._count?.workflows ?? 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function slugKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return base || "field";
}

function emptyCatalog(layoutId: string | null): CustomFieldCatalogDTO {
  return { layoutId, sections: [], unsectioned: [] };
}

function buildCatalog(
  layoutId: string | null,
  sections: {
    id: string;
    entityType: string;
    name: string;
    position: number;
    columns?: number;
  }[],
  fields: Parameters<typeof toFieldDTO>[0][],
): CustomFieldCatalogDTO {
  const bySection = new Map<string, CustomFieldDTO[]>();
  const unsectioned: CustomFieldDTO[] = [];
  for (const field of fields) {
    const dto = toFieldDTO(field);
    if (field.sectionId) {
      const list = bySection.get(field.sectionId) ?? [];
      list.push(dto);
      bySection.set(field.sectionId, list);
    } else {
      unsectioned.push(dto);
    }
  }
  return {
    layoutId,
    sections: sections.map((section) => ({
      id: section.id,
      entityType: section.entityType,
      name: section.name,
      position: section.position,
      columns: section.columns === 2 ? 2 : 1,
      fields: bySection.get(section.id) ?? [],
    })),
    unsectioned,
  };
}

async function firstLayoutId(
  entityType: string,
  projectId = "",
): Promise<string | null> {
  const row = await prisma.formLayout.findFirst({
    where: { entityType, projectId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function requireLayout(id: string, entityType?: string) {
  const layout = await prisma.formLayout.findUnique({
    where: { id },
    select: { id: true, entityType: true, name: true, projectId: true },
  });
  if (!layout) throw new Error("That layout no longer exists");
  if (entityType && layout.entityType !== entityType) {
    throw new Error("That layout is not on this module");
  }
  await requireFieldModuleAccess(layout.entityType, layout.projectId);
  return layout;
}

async function uniqueLayoutName(
  entityType: string,
  projectId: string,
  name: string,
  exceptId?: string,
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Layout name is required");
  if (trimmed.length > MAX_LABEL) throw new Error("Keep the name shorter");
  const clash = await prisma.formLayout.findUnique({
    where: { entityType_projectId_name: { entityType, projectId, name: trimmed } },
    select: { id: true },
  });
  if (clash && clash.id !== exceptId) {
    throw new Error(`There is already a “${trimmed}” layout`);
  }
  return trimmed;
}

function toFieldDTO(row: {
  id: string;
  entityType: string;
  key: string;
  label: string;
  type: string;
  options: string | null;
  binding?: string | null;
  required: boolean;
  showOn: string;
  visibility?: string | null;
  sectionId: string | null;
  position: number;
}): CustomFieldDTO {
  const type = isCustomFieldType(row.type) ? row.type : "text";
  return {
    id: row.id,
    entityType: row.entityType,
    key: row.key,
    label: row.label,
    type,
    options: type === "relation" ? [] : parseFieldOptions(row.options),
    relation: type === "relation" ? parseRelationConfig(row.options) : null,
    script: type === "text" ? parseTextConfig(row.options).script : null,
    userMultiple: type === "user" ? parseUserConfig(row.options).multiple : false,
    countryMultiple:
      type === "country" ? parseCountryConfig(row.options).multiple : false,
    urlIcon: type === "url" ? parseUrlConfig(row.options).icon : null,
    binding: row.binding ?? null,
    required: row.required,
    showOn: isFieldShowOn(row.showOn) ? row.showOn : "both",
    visibility: parseFieldVisibility(row.visibility),
    sectionId: row.sectionId,
    position: row.position,
  };
}

async function seedModuleBindings(layoutId: string, entityType: string) {
  const bindings = getModule(entityType).bindings;
  if (bindings.length === 0) return;
  const existing = await prisma.customField.findMany({
    where: { layoutId },
    select: { binding: true, key: true, position: true },
  });
  const taken = new Set(
    existing.flatMap((row) => [row.binding, row.key].filter(Boolean) as string[]),
  );
  const start = existing.length
    ? Math.min(...existing.map((row) => row.position))
    : 1024;
  const gap = start / (bindings.length + 1);
  const toCreate = bindings.filter((binding) => !taken.has(binding.key));
  if (toCreate.length === 0) return;
  await prisma.customField.createMany({
    data: toCreate.map((binding, index) => ({
      entityType,
      layoutId,
      key: binding.key,
      label: binding.label,
      type: binding.type,
      binding: binding.key,
      required: Boolean(binding.required),
      options: binding.relation
        ? stringifyRelationConfig(binding.relation)
        : undefined,
      position: gap * (index + 1),
    })),
  });
}

export async function listFormLayouts(
  entityType: WorkflowEntityType = "deal",
  projectId = "",
): Promise<FormLayoutDTO[]> {
  await requireFieldModuleAccess(entityType, projectId);
  const rows = await prisma.formLayout.findMany({
    where: { entityType, projectId },
    orderBy: { position: "asc" },
    include: { _count: { select: { fields: true, workflows: true } } },
  });
  return rows.map((row) => toLayoutDTO(row));
}

export async function createFormLayout(input: {
  entityType?: WorkflowEntityType;
  projectId?: string;
  name: string;
}): Promise<ActionResult<FormLayoutDTO>> {
  return fieldAction("layout-create", async () => {
    const entityType = input.entityType ?? "deal";
    const projectId = input.projectId ?? "";
    await requireFieldModuleAccess(entityType, projectId);
    const name = await uniqueLayoutName(entityType, projectId, input.name);
    const last = await prisma.formLayout.findFirst({
      where: { entityType, projectId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const created = await prisma.formLayout.create({
      data: {
        entityType,
        projectId,
        name,
        position: positionBetween(last?.position ?? null, null),
      },
    });
    await seedModuleBindings(created.id, entityType);
    revalidate(entityType, projectId);
    return toLayoutDTO(created, {
      fieldCount: getModule(entityType).bindings.length,
      flowCount: 0,
    });
  });
}

export async function updateFormLayout(
  id: string,
  input: { name: string },
): Promise<ActionResult<FormLayoutDTO>> {
  return fieldAction("layout-update", async () => {
    const existing = await requireLayout(id);
    const name = await uniqueLayoutName(
      existing.entityType,
      existing.projectId,
      input.name,
      id,
    );
    const updated = await prisma.formLayout.update({
      where: { id },
      data: { name },
      include: { _count: { select: { fields: true, workflows: true } } },
    });
    revalidate(existing.entityType, existing.projectId);
    return toLayoutDTO(updated);
  });
}

export async function deleteFormLayout(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return fieldAction("layout-delete", async () => {
    const existing = await requireLayout(id);
    const remaining = await prisma.formLayout.findFirst({
      where: {
        entityType: existing.entityType,
        projectId: existing.projectId,
        id: { not: id },
      },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    if (!remaining) throw new Error("Keep at least one layout");
    await prisma.$transaction([
      prisma.workflow.updateMany({
        where: { layoutId: id },
        data: { layoutId: remaining.id },
      }),
      prisma.formLayout.delete({ where: { id } }),
    ]);
    revalidate(existing.entityType, existing.projectId);
    return { id };
  });
}

export async function getCustomFieldCatalog(
  entityType: WorkflowEntityType = "deal",
  layoutId?: string | null,
  projectId = "",
): Promise<CustomFieldCatalogDTO> {
  if (layoutId) await requireLayout(layoutId, entityType);
  else await requireFieldModuleAccess(entityType, projectId);
  const resolved = layoutId ?? (await firstLayoutId(entityType, projectId));
  if (!resolved) return emptyCatalog(null);
  const [sections, fields] = await Promise.all([
    prisma.customFieldSection.findMany({
      where: { layoutId: resolved },
      orderBy: { position: "asc" },
    }),
    prisma.customField.findMany({
      where: { layoutId: resolved },
      orderBy: { position: "asc" },
    }),
  ]);
  return buildCatalog(resolved, sections, fields);
}

export async function getAllLayoutCatalogs(
  entityType: WorkflowEntityType = "deal",
  projectId = "",
): Promise<Record<string, CustomFieldCatalogDTO>> {
  await requireFieldModuleAccess(entityType, projectId);
  const [layouts, sections, fields] = await Promise.all([
    prisma.formLayout.findMany({
      where: { entityType, projectId },
      select: { id: true },
    }),
    prisma.customFieldSection.findMany({
      where: projectId
        ? { entityType, layout: { projectId } }
        : { entityType },
      orderBy: { position: "asc" },
    }),
    prisma.customField.findMany({
      where: projectId
        ? { entityType, layout: { projectId } }
        : { entityType },
      orderBy: { position: "asc" },
    }),
  ]);
  const catalogs: Record<string, CustomFieldCatalogDTO> = {};
  for (const layout of layouts) {
    catalogs[layout.id] = buildCatalog(
      layout.id,
      sections.filter((s) => s.layoutId === layout.id),
      fields.filter((f) => f.layoutId === layout.id),
    );
  }
  return catalogs;
}

export async function listCustomFields(
  entityType: WorkflowEntityType = "deal",
  layoutId?: string | null,
  projectId = "",
): Promise<CustomFieldDTO[]> {
  if (layoutId) await requireLayout(layoutId, entityType);
  else await requireFieldModuleAccess(entityType, projectId);
  const rows = await prisma.customField.findMany({
    where: layoutId
      ? { layoutId }
      : projectId
        ? { entityType, layout: { projectId } }
        : { entityType },
    orderBy: { position: "asc" },
  });
  return rows.map(toFieldDTO);
}

export async function getCustomFieldValues(
  entityType: WorkflowEntityType,
  recordId: string,
): Promise<Record<string, string>> {
  await requireUser();
  const rows = await prisma.customFieldValue.findMany({
    where: { entityType, recordId },
    select: { fieldId: true, value: true },
  });
  return Object.fromEntries(rows.map((r) => [r.fieldId, r.value]));
}

export async function createCustomFieldSection(input: {
  entityType?: WorkflowEntityType;
  layoutId?: string | null;
  name: string;
}): Promise<ActionResult<CustomFieldSectionDTO>> {
  return fieldAction("section-create", async () => {
    const entityType = input.entityType ?? "deal";
    const name = input.name.trim();
    if (!name) throw new Error("Section name is required");
    if (name.length > MAX_LABEL) throw new Error("Keep the name shorter");
    const layoutId =
      input.layoutId ?? (await firstLayoutId(entityType));
    if (!layoutId) throw new Error("Create a layout first");
    const layout = await requireLayout(layoutId, entityType);

    const last = await prisma.customFieldSection.findFirst({
      where: { layoutId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const created = await prisma.customFieldSection.create({
      data: {
        entityType,
        layoutId,
        name,
        position: positionBetween(last?.position ?? null, null),
      },
    });
    revalidate(entityType, layout.projectId);
    return {
      id: created.id,
      entityType,
      name: created.name,
      position: created.position,
      columns: 1,
      fields: [],
    };
  });
}

function sectionColumns(value: number | undefined): 1 | 2 {
  return value === 2 ? 2 : 1;
}

export async function updateCustomFieldSection(
  id: string,
  input: { name?: string; columns?: number },
): Promise<ActionResult<{ id: string; name: string; columns: number }>> {
  return fieldAction("section-update", async () => {
    const existing = await prisma.customFieldSection.findUnique({
      where: { id },
      select: {
        entityType: true,
        name: true,
        columns: true,
        layoutId: true,
      },
    });
    if (!existing) throw new Error("That section no longer exists");
    const layout = existing.layoutId
      ? await requireLayout(existing.layoutId)
      : null;
    if (!layout) await requireFieldModuleAccess(existing.entityType);
    const data: { name?: string; columns?: number } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("Section name is required");
      data.name = name;
    }
    if (input.columns !== undefined) data.columns = sectionColumns(input.columns);
    const updated = await prisma.customFieldSection.update({
      where: { id },
      data,
      select: { id: true, name: true, columns: true },
    });
    revalidate(existing.entityType, layout?.projectId ?? "");
    return {
      id: updated.id,
      name: updated.name,
      columns: sectionColumns(updated.columns),
    };
  });
}

export async function deleteCustomFieldSection(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return fieldAction("section-delete", async () => {
    const existing = await prisma.customFieldSection.findUnique({
      where: { id },
      select: { entityType: true, layoutId: true },
    });
    if (!existing) throw new Error("That section no longer exists");
    const layout = existing.layoutId
      ? await requireLayout(existing.layoutId)
      : null;
    if (!layout) await requireFieldModuleAccess(existing.entityType);
    await prisma.customFieldSection.delete({ where: { id } });
    revalidate(existing.entityType, layout?.projectId ?? "");
    return { id };
  });
}

export async function placeCustomFieldSections(input: {
  layoutId: string;
  orderedIds: string[];
}): Promise<ActionResult<{ ids: string[] }>> {
  return fieldAction("section-place", async () => {
    const layout = await requireLayout(input.layoutId);
    const existing = await prisma.customFieldSection.findMany({
      where: { layoutId: input.layoutId },
      select: { id: true },
    });
    const known = new Set(existing.map((row) => row.id));
    if (
      input.orderedIds.length !== existing.length ||
      input.orderedIds.some((id) => !known.has(id))
    ) {
      throw new Error("The list changed — reload and try again");
    }
    await prisma.$transaction(
      planReorder(input.orderedIds).map((row) =>
        prisma.customFieldSection.update({
          where: { id: row.id },
          data: { position: row.position },
        }),
      ),
    );
    revalidate(layout.entityType, layout.projectId);
    return { ids: input.orderedIds };
  });
}

export async function createCustomField(input: {
  entityType?: WorkflowEntityType;
  layoutId?: string | null;
  label: string;
  type?: string;
  binding?: string | null;
  sectionId?: string | null;
}): Promise<ActionResult<CustomFieldDTO>> {
  return fieldAction("create", async () => {
    const entityType = input.entityType ?? "deal";
    const label = input.label.trim();
    if (!label) throw new Error("Field label is required");
    if (label.length > MAX_LABEL) throw new Error("Keep the label shorter");
    const bound = input.binding ? moduleBinding(entityType, input.binding) : undefined;
    if (input.binding && !bound) {
      throw new Error("That system field is not on this module");
    }
    const type = bound
      ? bound.type
      : input.type && isCustomFieldType(input.type)
        ? input.type
        : "text";

    let layoutId = input.layoutId ?? (await firstLayoutId(entityType));
    if (input.sectionId) {
      const section = await prisma.customFieldSection.findUnique({
        where: { id: input.sectionId },
        select: { layoutId: true, entityType: true },
      });
      if (!section) throw new Error("That section no longer exists");
      layoutId = section.layoutId ?? layoutId;
    }
    if (!layoutId) throw new Error("Create a layout first");
    const layout = await requireLayout(layoutId, entityType);

    if (bound) {
      const clash = await prisma.customField.findFirst({
        where: {
          layoutId,
          OR: [{ binding: bound.key }, { key: bound.key }],
        },
        select: { id: true },
      });
      if (clash) throw new Error(`“${bound.label}” is already on this layout`);
    }

    let key = bound?.key ?? slugKey(label);
    if (!bound) {
      const taken = await prisma.customField.findMany({
        where: { layoutId, key: { startsWith: key } },
        select: { key: true },
      });
      const used = new Set(taken.map((r) => r.key));
      if (used.has(key)) {
        let n = 2;
        while (used.has(`${key}_${n}`)) n += 1;
        key = `${key}_${n}`;
      }
    }

    const last = await prisma.customField.findFirst({
      where: { layoutId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const created = await prisma.customField.create({
      data: {
        entityType,
        layoutId,
        key,
        label: bound?.label ?? label,
        type,
        binding: bound?.key ?? null,
        required: bound?.required ?? false,
        options: bound?.relation
          ? stringifyRelationConfig(bound.relation)
          : type === "relation"
            ? stringifyRelationConfig(DEFAULT_RELATION)
            : type === "user"
              ? stringifyUserConfig({ multiple: false })
              : type === "country"
                ? stringifyCountryConfig({ multiple: false })
                : type === "url"
                  ? stringifyUrlConfig({ icon: null })
                  : undefined,
        sectionId: input.sectionId ?? null,
        position: positionBetween(last?.position ?? null, null),
      },
    });
    revalidate(entityType, layout.projectId);
    return toFieldDTO(created);
  });
}

export async function updateCustomField(
  id: string,
  input: {
    label?: string;
    type?: string;
    options?: string[];
    relation?: RelationConfig;
    userMultiple?: boolean;
    countryMultiple?: boolean;
    urlIcon?: UrlIconId | null;
    script?: TextScript | null;
    required?: boolean;
    showOn?: string;
    visibility?: FieldVisibility | null;
    sectionId?: string | null;
  },
): Promise<ActionResult<CustomFieldDTO>> {
  return fieldAction("update", async () => {
    const existing = await prisma.customField.findUnique({
      where: { id },
      select: { entityType: true, binding: true, layoutId: true, type: true },
    });
    if (!existing) throw new Error("That field no longer exists");
    const layout = existing.layoutId
      ? await requireLayout(existing.layoutId)
      : null;
    if (!layout) await requireFieldModuleAccess(existing.entityType);

    const data: {
      label?: string;
      type?: string;
      options?: string | null;
      required?: boolean;
      showOn?: string;
      visibility?: string | null;
      sectionId?: string | null;
    } = {};
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) throw new Error("Field label is required");
      data.label = label;
    }
    if (input.type !== undefined && !existing.binding) {
      if (!isCustomFieldType(input.type)) throw new Error("Unknown field type");
      data.type = input.type;
      if (input.type === "relation" && input.relation === undefined) {
        data.options = stringifyRelationConfig(DEFAULT_RELATION);
      }
      if (input.type === "user" && input.userMultiple === undefined) {
        data.options = stringifyUserConfig({ multiple: false });
      }
      if (input.type === "country" && input.countryMultiple === undefined) {
        data.options = stringifyCountryConfig({ multiple: false });
      }
    }
    if (input.options !== undefined && !existing.binding) {
      data.options = JSON.stringify(input.options.map((o) => o.trim()).filter(Boolean));
    }
    if (input.relation !== undefined && !existing.binding) {
      data.options = stringifyRelationConfig(input.relation);
    }
    if (input.userMultiple !== undefined && !existing.binding) {
      data.options = stringifyUserConfig({ multiple: input.userMultiple });
    }
    if (input.countryMultiple !== undefined && !existing.binding) {
      data.options = stringifyCountryConfig({
        multiple: input.countryMultiple,
      });
    }
    if (input.script !== undefined) {
      const type = data.type ?? existing.type;
      if (type !== "text") throw new Error("Arabic only is for single line fields");
      data.options = stringifyTextConfig({ script: input.script });
    }
    if (input.required !== undefined && existing.binding !== "title") {
      data.required = input.required;
    }
    if (input.showOn !== undefined) {
      if (!isFieldShowOn(input.showOn)) throw new Error("Unknown form visibility");
      data.showOn = input.showOn;
    }
    if (input.visibility !== undefined) {
      data.visibility = stringifyFieldVisibility(input.visibility);
    }
    if (input.sectionId !== undefined) data.sectionId = input.sectionId;

    const updated = await prisma.customField.update({ where: { id }, data });
    revalidate(existing.entityType, layout?.projectId ?? "");
    return toFieldDTO(updated);
  });
}

export async function deleteCustomField(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return fieldAction("delete", async () => {
    const existing = await prisma.customField.findUnique({
      where: { id },
      select: { entityType: true, binding: true, layoutId: true },
    });
    if (!existing) throw new Error("That field no longer exists");
    const layout = existing.layoutId
      ? await requireLayout(existing.layoutId)
      : null;
    if (!layout) await requireFieldModuleAccess(existing.entityType);
    if (existing.binding === "title") {
      throw new Error("Title stays on the layout");
    }
    await prisma.customField.delete({ where: { id } });
    revalidate(existing.entityType, layout?.projectId ?? "");
    return { id };
  });
}

export async function placeCustomFields(input: {
  layoutId: string;
  placements: { id: string; sectionId: string | null }[];
}): Promise<ActionResult<CustomFieldDTO[]>> {
  return fieldAction("place", async () => {
    const layout = await requireLayout(input.layoutId);
    const existing = await prisma.customField.findMany({
      where: { layoutId: input.layoutId },
      select: { id: true },
    });
    const known = new Set(existing.map((f) => f.id));
    if (
      input.placements.length !== existing.length ||
      input.placements.some((row) => !known.has(row.id))
    ) {
      throw new Error("The list changed — reload and try again");
    }
    const positions = planReorder(input.placements.map((row) => row.id));
    await prisma.$transaction(
      input.placements.map((row, index) =>
        prisma.customField.update({
          where: { id: row.id },
          data: {
            sectionId: row.sectionId,
            position: positions[index].position,
          },
        }),
      ),
    );
    revalidate(layout.entityType, layout.projectId);
    return listCustomFields(layout.entityType as WorkflowEntityType, input.layoutId);
  });
}

export async function reorderCustomFields(
  entityType: WorkflowEntityType,
  orderedIds: string[],
): Promise<ActionResult<CustomFieldDTO[]>> {
  return fieldAction("reorder", async () => {
    await requireFieldModuleAccess(entityType);
    const existing = await prisma.customField.findMany({
      where: { entityType },
      select: { id: true },
    });
    const known = new Set(existing.map((f) => f.id));
    if (orderedIds.some((id) => !known.has(id))) {
      throw new Error("The list changed — reload and try again");
    }
    await prisma.$transaction(
      planReorder(orderedIds).map((row) =>
        prisma.customField.update({
          where: { id: row.id },
          data: { position: row.position },
        }),
      ),
    );
    revalidate(entityType);
    return listCustomFields(entityType);
  });
}

export async function saveCustomFieldValues(input: {
  entityType: WorkflowEntityType;
  recordId: string;
  values: Record<string, string>;
  layoutId?: string | null;
}): Promise<void> {
  const fields = await prisma.customField.findMany({
    where: input.layoutId
      ? { layoutId: input.layoutId }
      : { entityType: input.entityType },
    select: { id: true, binding: true, type: true, options: true },
  });
  const allowed = new Set(
    fields.filter((field) => !field.binding).map((field) => field.id),
  );
  const entries = Object.entries(input.values)
    .filter(([id]) => allowed.has(id))
    .map(([fieldId, value]) => {
      const field = fields.find((row) => row.id === fieldId);
      const script =
        field?.type === "text" ? parseTextConfig(field.options).script : null;
      return [fieldId, applyTextScript(value, script)] as const;
    });

  await prisma.$transaction(
    entries.map(([fieldId, value]) =>
      value.trim()
        ? prisma.customFieldValue.upsert({
            where: {
              entityType_recordId_fieldId: {
                entityType: input.entityType,
                recordId: input.recordId,
                fieldId,
              },
            },
            create: {
              entityType: input.entityType,
              recordId: input.recordId,
              fieldId,
              value,
            },
            update: { value },
          })
        : prisma.customFieldValue.deleteMany({
            where: {
              entityType: input.entityType,
              recordId: input.recordId,
              fieldId,
            },
          }),
    ),
  );
}
