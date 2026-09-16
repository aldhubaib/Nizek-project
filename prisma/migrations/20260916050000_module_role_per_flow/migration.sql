-- Each task flow owns its own named roles. Existing project-level names are
-- attached to the first flow, then copied onto the others so blueprints keep
-- working.

ALTER TABLE "ModuleRole" ADD COLUMN "workflowId" TEXT;

UPDATE "ModuleRole" AS r
SET "workflowId" = (
  SELECT w.id
  FROM "Workflow" AS w
  WHERE w."entityType" = r."entityType"
    AND w."projectId" = r."projectId"
  ORDER BY w.position ASC, w."createdAt" ASC
  LIMIT 1
)
WHERE r."workflowId" IS NULL;

DELETE FROM "ModuleRole" WHERE "workflowId" IS NULL;

DROP INDEX IF EXISTS "ModuleRole_entityType_projectId_name_key";
DROP INDEX IF EXISTS "ModuleRole_single_default";

INSERT INTO "ModuleRole" (
  "id",
  "entityType",
  "projectId",
  "name",
  "isDefault",
  "isAdmin",
  "canCreateRecord",
  "canEditRecord",
  "canDeleteRecord",
  "canMoveRecord",
  "canManageRoles",
  "canEditBlueprint",
  "createdAt",
  "updatedAt",
  "workflowId"
)
SELECT
  gen_random_uuid()::text,
  r."entityType",
  r."projectId",
  r."name",
  r."isDefault",
  r."isAdmin",
  r."canCreateRecord",
  r."canEditRecord",
  r."canDeleteRecord",
  r."canMoveRecord",
  r."canManageRoles",
  r."canEditBlueprint",
  NOW(),
  NOW(),
  w.id
FROM "ModuleRole" AS r
INNER JOIN "Workflow" AS w
  ON w."entityType" = r."entityType"
 AND w."projectId" = r."projectId"
 AND w.id <> r."workflowId";

INSERT INTO "ModuleRoleMember" (
  "id",
  "entityType",
  "projectId",
  "userId",
  "roleId",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  m."entityType",
  m."projectId",
  m."userId",
  copy.id,
  NOW()
FROM "ModuleRoleMember" AS m
INNER JOIN "ModuleRole" AS orig ON orig.id = m."roleId"
INNER JOIN "ModuleRole" AS copy
  ON copy."workflowId" <> orig."workflowId"
 AND copy.name = orig.name
 AND copy."entityType" = orig."entityType"
 AND copy."projectId" = orig."projectId";

UPDATE "WorkflowStatus" AS s
SET "modifyByRole" = replace(s."modifyByRole", orig.id, copy.id)
FROM "ModuleRole" AS orig
INNER JOIN "ModuleRole" AS copy
  ON copy.name = orig.name
 AND copy."entityType" = orig."entityType"
 AND copy."projectId" = orig."projectId"
 AND copy."workflowId" <> orig."workflowId"
WHERE s."workflowId" = copy."workflowId"
  AND s."modifyByRole" IS NOT NULL
  AND orig."workflowId" = (
    SELECT w.id
    FROM "Workflow" AS w
    WHERE w."entityType" = orig."entityType"
      AND w."projectId" = orig."projectId"
    ORDER BY w.position ASC, w."createdAt" ASC
    LIMIT 1
  );

UPDATE "WorkflowTransition" AS t
SET "moveRoleIds" = replace(t."moveRoleIds", orig.id, copy.id)
FROM "ModuleRole" AS orig
INNER JOIN "ModuleRole" AS copy
  ON copy.name = orig.name
 AND copy."entityType" = orig."entityType"
 AND copy."projectId" = orig."projectId"
 AND copy."workflowId" <> orig."workflowId"
WHERE t."workflowId" = copy."workflowId"
  AND t."moveRoleIds" IS NOT NULL
  AND orig."workflowId" = (
    SELECT w.id
    FROM "Workflow" AS w
    WHERE w."entityType" = orig."entityType"
      AND w."projectId" = orig."projectId"
    ORDER BY w.position ASC, w."createdAt" ASC
    LIMIT 1
  );

ALTER TABLE "ModuleRole" ALTER COLUMN "workflowId" SET NOT NULL;

ALTER TABLE "ModuleRole" ADD CONSTRAINT "ModuleRole_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ModuleRole_workflowId_name_key" ON "ModuleRole"("workflowId", "name");
CREATE INDEX "ModuleRole_workflowId_idx" ON "ModuleRole"("workflowId");
CREATE UNIQUE INDEX "ModuleRole_single_default"
  ON "ModuleRole"("workflowId") WHERE "isDefault" = true;
