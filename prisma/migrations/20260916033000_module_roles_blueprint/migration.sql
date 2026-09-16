-- Project-level board roles (Jira-style). The blueprint then says which
-- of those roles may edit fields on a status and who may take each arrow.

CREATE TABLE "ModuleRole" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "canCreateRecord" BOOLEAN NOT NULL DEFAULT false,
    "canEditRecord" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteRecord" BOOLEAN NOT NULL DEFAULT false,
    "canMoveRecord" BOOLEAN NOT NULL DEFAULT false,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "canEditBlueprint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleRole_entityType_projectId_name_key"
  ON "ModuleRole"("entityType", "projectId", "name");
CREATE INDEX "ModuleRole_entityType_projectId_idx"
  ON "ModuleRole"("entityType", "projectId");
CREATE UNIQUE INDEX "ModuleRole_single_default"
  ON "ModuleRole"("entityType", "projectId") WHERE "isDefault" = true;

CREATE TABLE "ModuleRoleMember" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleRoleMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleRoleMember_entityType_projectId_userId_key"
  ON "ModuleRoleMember"("entityType", "projectId", "userId");
CREATE INDEX "ModuleRoleMember_entityType_projectId_idx"
  ON "ModuleRoleMember"("entityType", "projectId");
CREATE INDEX "ModuleRoleMember_roleId_idx" ON "ModuleRoleMember"("roleId");
CREATE INDEX "ModuleRoleMember_userId_idx" ON "ModuleRoleMember"("userId");

ALTER TABLE "ModuleRoleMember" ADD CONSTRAINT "ModuleRoleMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleRoleMember" ADD CONSTRAINT "ModuleRoleMember_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "ModuleRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowStatus" ADD COLUMN "modifyByRole" TEXT;
ALTER TABLE "WorkflowTransition" ADD COLUMN "moveRoleIds" TEXT;
