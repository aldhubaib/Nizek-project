-- Project boards share the deals workflow engine. Scope flows and layouts
-- by projectId (empty string = module-global, used by deals).

ALTER TABLE "Workflow" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "Workflow_entityType_name_key";
CREATE UNIQUE INDEX "Workflow_entityType_projectId_name_key" ON "Workflow"("entityType", "projectId", "name");
DROP INDEX IF EXISTS "Workflow_entityType_position_idx";
CREATE INDEX "Workflow_entityType_projectId_position_idx" ON "Workflow"("entityType", "projectId", "position");

ALTER TABLE "FormLayout" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "FormLayout_entityType_name_key";
CREATE UNIQUE INDEX "FormLayout_entityType_projectId_name_key" ON "FormLayout"("entityType", "projectId", "name");
DROP INDEX IF EXISTS "FormLayout_entityType_position_idx";
CREATE INDEX "FormLayout_entityType_projectId_position_idx" ON "FormLayout"("entityType", "projectId", "position");

CREATE TABLE "BoardRecord" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "statusId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BoardRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardRecord_projectId_workflowId_statusId_idx" ON "BoardRecord"("projectId", "workflowId", "statusId");
CREATE INDEX "BoardRecord_workflowId_statusId_idx" ON "BoardRecord"("workflowId", "statusId");
CREATE INDEX "BoardRecord_createdById_idx" ON "BoardRecord"("createdById");

ALTER TABLE "BoardRecord" ADD CONSTRAINT "BoardRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardRecord" ADD CONSTRAINT "BoardRecord_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardRecord" ADD CONSTRAINT "BoardRecord_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "WorkflowStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoardRecord" ADD CONSTRAINT "BoardRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
