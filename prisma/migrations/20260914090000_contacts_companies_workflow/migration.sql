-- Contacts and companies use the same workflow + layout engine as deals.
-- Seed rows attach to whatever layout/flow already exists for that module.

-- Company: nameAr is no longer a locked unique system field.
DROP INDEX IF EXISTS "Company_nameAr_key";
ALTER TABLE "Company" ALTER COLUMN "nameAr" SET DEFAULT '';
ALTER TABLE "Company" ALTER COLUMN "industry" SET DEFAULT '';

INSERT INTO "FormLayout" (id, "entityType", name, "projectId", position, "createdAt", "updatedAt")
SELECT 'fl_contact_default', 'contact', 'Contacts', '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FormLayout" WHERE "entityType" = 'contact' AND "projectId" = ''
);

INSERT INTO "FormLayout" (id, "entityType", name, "projectId", position, "createdAt", "updatedAt")
SELECT 'fl_company_default', 'company', 'Companies', '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FormLayout" WHERE "entityType" = 'company' AND "projectId" = ''
);

INSERT INTO "CustomField" (id, "entityType", key, label, type, binding, required, "showOn", "layoutId", position, "createdAt", "updatedAt")
SELECT 'cf_contact_title', 'contact', 'title', 'Name', 'text', 'title', true, 'both', l.id, 64, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "FormLayout" l
WHERE l."entityType" = 'contact' AND l."projectId" = ''
  AND NOT EXISTS (SELECT 1 FROM "CustomField" WHERE "layoutId" = l.id AND key = 'title')
ORDER BY l.position
LIMIT 1;

INSERT INTO "CustomField" (id, "entityType", key, label, type, binding, required, "showOn", "layoutId", position, "createdAt", "updatedAt")
SELECT 'cf_company_title', 'company', 'title', 'Name', 'text', 'title', true, 'both', l.id, 64, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "FormLayout" l
WHERE l."entityType" = 'company' AND l."projectId" = ''
  AND NOT EXISTS (SELECT 1 FROM "CustomField" WHERE "layoutId" = l.id AND key = 'title')
ORDER BY l.position
LIMIT 1;

INSERT INTO "Workflow" (id, "entityType", name, "projectId", position, "layoutId", "blueprintEnabled", "createdAt", "updatedAt")
SELECT
  'wf_contact_default',
  'contact',
  'Contacts',
  '',
  1,
  (SELECT id FROM "FormLayout" WHERE "entityType" = 'contact' AND "projectId" = '' ORDER BY position ASC LIMIT 1),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Workflow" WHERE "entityType" = 'contact' AND "projectId" = ''
);

INSERT INTO "Workflow" (id, "entityType", name, "projectId", position, "layoutId", "blueprintEnabled", "createdAt", "updatedAt")
SELECT
  'wf_company_default',
  'company',
  'Companies',
  '',
  1,
  (SELECT id FROM "FormLayout" WHERE "entityType" = 'company' AND "projectId" = '' ORDER BY position ASC LIMIT 1),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Workflow" WHERE "entityType" = 'company' AND "projectId" = ''
);

-- Reuse existing contact column ids as workflow statuses.
INSERT INTO "WorkflowStatus" (id, "workflowId", name, color, kind, position, "canvasX", "canvasY", "createdAt", "updatedAt")
SELECT
  cs.id,
  w.id,
  cs.name,
  cs.color,
  'open',
  cs.position,
  (ROW_NUMBER() OVER (ORDER BY cs.position) - 1) * 280,
  80,
  cs."createdAt",
  cs."updatedAt"
FROM "ContactStage" cs
CROSS JOIN LATERAL (
  SELECT id FROM "Workflow" WHERE "entityType" = 'contact' AND "projectId" = '' ORDER BY position ASC LIMIT 1
) w
ON CONFLICT DO NOTHING;

INSERT INTO "WorkflowStatus" (id, "workflowId", name, color, kind, position, "canvasX", "canvasY", "createdAt", "updatedAt")
SELECT 'ws_company_todo', w.id, 'To do', 'slate', 'open', 1024, 0, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT id FROM "Workflow" WHERE "entityType" = 'company' AND "projectId" = '' ORDER BY position ASC LIMIT 1) w
WHERE NOT EXISTS (SELECT 1 FROM "WorkflowStatus" WHERE "workflowId" = w.id);

INSERT INTO "WorkflowStatus" (id, "workflowId", name, color, kind, position, "canvasX", "canvasY", "createdAt", "updatedAt")
SELECT 'ws_company_doing', w.id, 'In progress', 'sky', 'open', 2048, 280, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT id FROM "Workflow" WHERE "entityType" = 'company' AND "projectId" = '' ORDER BY position ASC LIMIT 1) w
WHERE NOT EXISTS (SELECT 1 FROM "WorkflowStatus" WHERE "workflowId" = w.id AND name = 'In progress');

INSERT INTO "WorkflowStatus" (id, "workflowId", name, color, kind, position, "canvasX", "canvasY", "createdAt", "updatedAt")
SELECT 'ws_company_done', w.id, 'Done', 'emerald', 'open', 3072, 560, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT id FROM "Workflow" WHERE "entityType" = 'company' AND "projectId" = '' ORDER BY position ASC LIMIT 1) w
WHERE NOT EXISTS (SELECT 1 FROM "WorkflowStatus" WHERE "workflowId" = w.id AND name = 'Done');

ALTER TABLE "Contact" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
UPDATE "Contact" SET "title" = TRIM(BOTH FROM ("firstName" || ' ' || "lastName"))
WHERE "title" = '';

ALTER TABLE "Contact" ADD COLUMN "workflowId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "statusId" TEXT;
UPDATE "Contact" SET
  "workflowId" = (SELECT id FROM "Workflow" WHERE "entityType" = 'contact' AND "projectId" = '' ORDER BY position ASC LIMIT 1),
  "statusId" = "stageId";
ALTER TABLE "Contact" ALTER COLUMN "workflowId" SET NOT NULL;
ALTER TABLE "Contact" ALTER COLUMN "firstName" SET DEFAULT '';
ALTER TABLE "Contact" ALTER COLUMN "lastName" SET DEFAULT '';
ALTER TABLE "Contact" ALTER COLUMN "phoneCountry" SET DEFAULT '';
ALTER TABLE "Contact" ALTER COLUMN "phoneNumber" SET DEFAULT '';

ALTER TABLE "Company" ADD COLUMN "workflowId" TEXT;
ALTER TABLE "Company" ADD COLUMN "statusId" TEXT;
UPDATE "Company" SET
  "workflowId" = (SELECT id FROM "Workflow" WHERE "entityType" = 'company' AND "projectId" = '' ORDER BY position ASC LIMIT 1),
  "statusId" = (
    SELECT id FROM "WorkflowStatus"
    WHERE "workflowId" = (SELECT id FROM "Workflow" WHERE "entityType" = 'company' AND "projectId" = '' ORDER BY position ASC LIMIT 1)
    ORDER BY position ASC
    LIMIT 1
  );
ALTER TABLE "Company" ALTER COLUMN "workflowId" SET NOT NULL;

ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_stageId_fkey";
DROP INDEX IF EXISTS "Contact_stageId_idx";
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "stageId";
DROP TABLE IF EXISTS "ContactStage";

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_statusId_fkey"
  FOREIGN KEY ("statusId") REFERENCES "WorkflowStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Contact_workflowId_statusId_idx" ON "Contact"("workflowId", "statusId");

ALTER TABLE "Company" ADD CONSTRAINT "Company_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_statusId_fkey"
  FOREIGN KEY ("statusId") REFERENCES "WorkflowStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Company_workflowId_statusId_idx" ON "Company"("workflowId", "statusId");
