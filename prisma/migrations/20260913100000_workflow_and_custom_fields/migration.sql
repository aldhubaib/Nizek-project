-- Generic workflow engine + custom fields. Existing deal flows, stages,
-- transitions and exit requirements are copied across, then the deal-specific
-- tables are dropped.

CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workflow_entityType_name_key" ON "Workflow"("entityType", "name");
CREATE INDEX "Workflow_entityType_position_idx" ON "Workflow"("entityType", "position");

CREATE TABLE "WorkflowStatus" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "kind" TEXT NOT NULL DEFAULT 'open',
    "position" DOUBLE PRECISION NOT NULL,
    "canvasX" DOUBLE PRECISION,
    "canvasY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowStatus_workflowId_name_key" ON "WorkflowStatus"("workflowId", "name");
CREATE INDEX "WorkflowStatus_workflowId_position_idx" ON "WorkflowStatus"("workflowId", "position");

ALTER TABLE "WorkflowStatus" ADD CONSTRAINT "WorkflowStatus_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "canvasX" DOUBLE PRECISION,
    "canvasY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowTransition_workflowId_idx" ON "WorkflowTransition"("workflowId");
CREATE INDEX "WorkflowTransition_fromStatusId_idx" ON "WorkflowTransition"("fromStatusId");
CREATE INDEX "WorkflowTransition_toStatusId_idx" ON "WorkflowTransition"("toStatusId");

ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_fromStatusId_fkey"
  FOREIGN KEY ("fromStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_toStatusId_fkey"
  FOREIGN KEY ("toStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowAction" (
    "id" TEXT NOT NULL,
    "transitionId" TEXT,
    "statusId" TEXT,
    "hook" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowAction_transitionId_position_idx" ON "WorkflowAction"("transitionId", "position");
CREATE INDEX "WorkflowAction_statusId_position_idx" ON "WorkflowAction"("statusId", "position");

ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_transitionId_fkey"
  FOREIGN KEY ("transitionId") REFERENCES "WorkflowTransition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_statusId_fkey"
  FOREIGN KEY ("statusId") REFERENCES "WorkflowStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomFieldSection" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomFieldSection_entityType_position_idx" ON "CustomFieldSection"("entityType", "position");

CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "options" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showOn" TEXT NOT NULL DEFAULT 'both',
    "sectionId" TEXT,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomField_entityType_key_key" ON "CustomField"("entityType", "key");
CREATE INDEX "CustomField_entityType_position_idx" ON "CustomField"("entityType", "position");
CREATE INDEX "CustomField_sectionId_idx" ON "CustomField"("sectionId");

ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "CustomFieldSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomFieldValue_entityType_recordId_fieldId_key"
  ON "CustomFieldValue"("entityType", "recordId", "fieldId");
CREATE INDEX "CustomFieldValue_fieldId_idx" ON "CustomFieldValue"("fieldId");
CREATE INDEX "CustomFieldValue_entityType_recordId_idx" ON "CustomFieldValue"("entityType", "recordId");

ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy existing deal pipelines into the generic tables (same ids so Deal
-- rows can be re-pointed without rewriting every id).
INSERT INTO "Workflow" ("id", "entityType", "name", "position", "createdAt", "updatedAt")
SELECT "id", 'deal', "name", "position", "createdAt", "updatedAt"
FROM "DealFlow";

INSERT INTO "WorkflowStatus" (
  "id", "workflowId", "name", "color", "kind", "position",
  "canvasX", "canvasY", "createdAt", "updatedAt"
)
SELECT
  s."id",
  s."flowId",
  s."name",
  s."color",
  CASE WHEN lower(s."name") = 'won' THEN 'won'
       WHEN lower(s."name") = 'lost' THEN 'lost'
       ELSE 'open' END,
  s."position",
  (row_number() OVER (PARTITION BY s."flowId" ORDER BY s."position") - 1) * 280,
  80,
  s."createdAt",
  s."updatedAt"
FROM "DealStage" s;

INSERT INTO "WorkflowTransition" (
  "id", "workflowId", "name", "fromStatusId", "toStatusId",
  "canvasX", "canvasY", "createdAt", "updatedAt"
)
SELECT
  t."id",
  t."flowId",
  'To ' || dest."name",
  t."fromStageId",
  t."toStageId",
  (COALESCE(src."canvasX", 0) + COALESCE(dest."canvasX", 0)) / 2,
  COALESCE(src."canvasY", 80) + 90,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "DealTransition" t
JOIN "WorkflowStatus" src ON src."id" = t."fromStageId"
JOIN "WorkflowStatus" dest ON dest."id" = t."toStageId";

INSERT INTO "WorkflowAction" (
  "id", "statusId", "hook", "type", "config", "position", "updatedAt"
)
SELECT
  'wfact_' || r."stageId",
  r."stageId",
  'onLeave',
  'require_fields',
  '{"fields":' || r.fields || '}',
  1024,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    "stageId",
    json_agg("field" ORDER BY "field")::text AS fields
  FROM "DealStageRequirement"
  GROUP BY "stageId"
) r;

-- Re-point Deal onto Workflow / WorkflowStatus.
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_flowId_fkey";
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_stageId_fkey";
DROP INDEX IF EXISTS "Deal_flowId_stageId_idx";
DROP INDEX IF EXISTS "Deal_stageId_idx";

ALTER TABLE "Deal" RENAME COLUMN "flowId" TO "workflowId";
ALTER TABLE "Deal" RENAME COLUMN "stageId" TO "statusId";

CREATE INDEX "Deal_workflowId_statusId_idx" ON "Deal"("workflowId", "statusId");
CREATE INDEX "Deal_statusId_idx" ON "Deal"("statusId");

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_statusId_fkey"
  FOREIGN KEY ("statusId") REFERENCES "WorkflowStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "DealStageRequirement";
DROP TABLE "DealTransition";
DROP TABLE "DealStage";
DROP TABLE "DealFlow";
