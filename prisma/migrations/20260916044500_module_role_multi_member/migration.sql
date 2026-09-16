-- A person can hold more than one board role.

DROP INDEX IF EXISTS "ModuleRoleMember_entityType_projectId_userId_key";

CREATE UNIQUE INDEX "ModuleRoleMember_roleId_userId_key"
  ON "ModuleRoleMember"("roleId", "userId");
