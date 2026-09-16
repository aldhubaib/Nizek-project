-- Task-flow roles. Separate from sprint ProjectRole and the legacy BoardRole.
-- Existing flows keep working: the app seeds Admin / Editor / Viewer on first
-- touch, with Editor as the default so current project members are not locked
-- out. New flows seed Viewer as the default and assign the creator Admin.

CREATE TABLE "WorkflowRole" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "canCreateRecord" BOOLEAN NOT NULL DEFAULT false,
    "canEditRecord" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteRecord" BOOLEAN NOT NULL DEFAULT false,
    "canMoveRecord" BOOLEAN NOT NULL DEFAULT false,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "canEditBlueprint" BOOLEAN NOT NULL DEFAULT false,
    "allowedTransitions" TEXT,
    "modifyFields" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowRole_workflowId_name_key" ON "WorkflowRole"("workflowId", "name");
CREATE INDEX "WorkflowRole_workflowId_idx" ON "WorkflowRole"("workflowId");

CREATE UNIQUE INDEX "WorkflowRole_single_default"
  ON "WorkflowRole"("workflowId") WHERE "isDefault" = true;

CREATE TABLE "WorkflowMember" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowMember_workflowId_userId_key" ON "WorkflowMember"("workflowId", "userId");
CREATE INDEX "WorkflowMember_workflowId_idx" ON "WorkflowMember"("workflowId");
CREATE INDEX "WorkflowMember_roleId_idx" ON "WorkflowMember"("roleId");
CREATE INDEX "WorkflowMember_userId_idx" ON "WorkflowMember"("userId");

ALTER TABLE "WorkflowRole" ADD CONSTRAINT "WorkflowRole_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowMember" ADD CONSTRAINT "WorkflowMember_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowMember" ADD CONSTRAINT "WorkflowMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowMember" ADD CONSTRAINT "WorkflowMember_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "WorkflowRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
