-- Bound fields write a real column / join table instead of CustomFieldValue.
-- Seed the deal system fields onto every existing layout so Title, Value,
-- Companies, and Contacts start as normal catalog rows the user can delete.

ALTER TABLE "CustomField" ADD COLUMN "binding" TEXT;

CREATE INDEX "CustomField_layoutId_binding_idx" ON "CustomField"("layoutId", "binding");

UPDATE "CustomField"
SET "binding" = "key"
WHERE "entityType" = 'deal'
  AND "key" IN ('title', 'value', 'companies', 'contacts')
  AND "binding" IS NULL;

INSERT INTO "CustomField" (
  "id",
  "entityType",
  "key",
  "label",
  "type",
  "options",
  "binding",
  "required",
  "showOn",
  "layoutId",
  "sectionId",
  "position",
  "createdAt",
  "updatedAt"
)
SELECT
  'bind_title_' || l."id",
  'deal',
  'title',
  'Title',
  'text',
  NULL,
  'title',
  true,
  'both',
  l."id",
  NULL,
  64,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "FormLayout" l
WHERE l."entityType" = 'deal'
  AND NOT EXISTS (
    SELECT 1 FROM "CustomField" f
    WHERE f."layoutId" = l."id" AND (f."binding" = 'title' OR f."key" = 'title')
  );

INSERT INTO "CustomField" (
  "id",
  "entityType",
  "key",
  "label",
  "type",
  "options",
  "binding",
  "required",
  "showOn",
  "layoutId",
  "sectionId",
  "position",
  "createdAt",
  "updatedAt"
)
SELECT
  'bind_value_' || l."id",
  'deal',
  'value',
  'Value',
  'number',
  NULL,
  'value',
  false,
  'both',
  l."id",
  NULL,
  128,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "FormLayout" l
WHERE l."entityType" = 'deal'
  AND NOT EXISTS (
    SELECT 1 FROM "CustomField" f
    WHERE f."layoutId" = l."id" AND (f."binding" = 'value' OR f."key" = 'value')
  );

INSERT INTO "CustomField" (
  "id",
  "entityType",
  "key",
  "label",
  "type",
  "options",
  "binding",
  "required",
  "showOn",
  "layoutId",
  "sectionId",
  "position",
  "createdAt",
  "updatedAt"
)
SELECT
  'bind_companies_' || l."id",
  'deal',
  'companies',
  'Companies',
  'relation',
  '{"model":"company","multiple":true}',
  'companies',
  false,
  'both',
  l."id",
  NULL,
  192,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "FormLayout" l
WHERE l."entityType" = 'deal'
  AND NOT EXISTS (
    SELECT 1 FROM "CustomField" f
    WHERE f."layoutId" = l."id" AND (f."binding" = 'companies' OR f."key" = 'companies')
  );

INSERT INTO "CustomField" (
  "id",
  "entityType",
  "key",
  "label",
  "type",
  "options",
  "binding",
  "required",
  "showOn",
  "layoutId",
  "sectionId",
  "position",
  "createdAt",
  "updatedAt"
)
SELECT
  'bind_contacts_' || l."id",
  'deal',
  'contacts',
  'Contacts',
  'relation',
  '{"model":"contact","multiple":true}',
  'contacts',
  false,
  'both',
  l."id",
  NULL,
  256,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "FormLayout" l
WHERE l."entityType" = 'deal'
  AND NOT EXISTS (
    SELECT 1 FROM "CustomField" f
    WHERE f."layoutId" = l."id" AND (f."binding" = 'contacts' OR f."key" = 'contacts')
  );
