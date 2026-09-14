-- Named form layouts. Each task flow picks one.

CREATE TABLE "FormLayout" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormLayout_entityType_name_key" ON "FormLayout"("entityType", "name");
CREATE INDEX "FormLayout_entityType_position_idx" ON "FormLayout"("entityType", "position");

INSERT INTO "FormLayout" ("id", "entityType", "name", "position", "createdAt", "updatedAt")
VALUES ('layout_tasks_flow', 'deal', 'Tasks flow', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Workflow" ADD COLUMN "layoutId" TEXT;
UPDATE "Workflow" SET "layoutId" = 'layout_tasks_flow' WHERE "entityType" = 'deal';
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_layoutId_fkey"
  FOREIGN KEY ("layoutId") REFERENCES "FormLayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomFieldSection" ADD COLUMN "layoutId" TEXT;
UPDATE "CustomFieldSection" SET "layoutId" = 'layout_tasks_flow' WHERE "entityType" = 'deal';
ALTER TABLE "CustomFieldSection" ADD CONSTRAINT "CustomFieldSection_layoutId_fkey"
  FOREIGN KEY ("layoutId") REFERENCES "FormLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CustomFieldSection_layoutId_position_idx" ON "CustomFieldSection"("layoutId", "position");

ALTER TABLE "CustomField" ADD COLUMN "layoutId" TEXT;
UPDATE "CustomField" SET "layoutId" = 'layout_tasks_flow' WHERE "entityType" = 'deal';
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_layoutId_fkey"
  FOREIGN KEY ("layoutId") REFERENCES "FormLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CustomField_layoutId_position_idx" ON "CustomField"("layoutId", "position");

DROP INDEX IF EXISTS "CustomField_entityType_key_key";
CREATE UNIQUE INDEX "CustomField_layoutId_key_key" ON "CustomField"("layoutId", "key");
