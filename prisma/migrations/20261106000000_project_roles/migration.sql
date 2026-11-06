-- Roles become per project. The global roles stay as presets (projectId null),
-- every project gets its own copy of each one, and members and invitations are
-- re-pointed at the copy for their project. Each copy carries the same name
-- and the same flags, so nobody's permissions change.
--
-- Prisma runs this file statement by statement with no transaction around it,
-- so every step is written to be safe to run again after a failure, and the
-- data step (copy and re-point) is one statement, which Postgres makes atomic.
--
-- "Project"."internalReviewRoleId", "internalReviewUserId" and
-- "maxPipelineTasks" are left in place on purpose: the previous release still
-- reads them while the two releases overlap during the deploy. A follow-up
-- migration drops them once this release is the only one running.

ALTER TABLE "ProjectRole" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "ProjectRole" ADD COLUMN IF NOT EXISTS "presetId" TEXT;

ALTER TABLE "ProjectRole" DROP CONSTRAINT IF EXISTS "ProjectRole_projectId_fkey";
ALTER TABLE "ProjectRole" ADD CONSTRAINT "ProjectRole_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRole" DROP CONSTRAINT IF EXISTS "ProjectRole_presetId_fkey";
ALTER TABLE "ProjectRole" ADD CONSTRAINT "ProjectRole_presetId_fkey"
  FOREIGN KEY ("presetId") REFERENCES "ProjectRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Names are unique per project. Presets have no project, and Postgres treats
-- null as distinct, so a partial index keeps preset names unique on their own.
-- On the live database the old rule is a constraint (it predates Prisma
-- Migrate); on a database built from 0_init it is a bare index. Drop whichever
-- is there.
ALTER TABLE "ProjectRole" DROP CONSTRAINT IF EXISTS "ProjectRole_name_key";
DROP INDEX IF EXISTS "ProjectRole_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRole_projectId_name_key" ON "ProjectRole"("projectId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRole_preset_name_key" ON "ProjectRole"("name") WHERE "projectId" IS NULL;
CREATE INDEX IF NOT EXISTS "ProjectRole_projectId_idx" ON "ProjectRole"("projectId");

-- One copy of every preset for every project that does not have one yet, then
-- every member and invitation pointed at the copy for its own project. One
-- statement, so the copies and the re-pointing land together or not at all.
-- "createdAt" is carried over so the roles keep their familiar order.
WITH copies AS (
  INSERT INTO "ProjectRole" (
    "id",
    "projectId",
    "presetId",
    "name",
    "description",
    "isAdmin",
    "isClient",
    "canCreateTask",
    "canModifyTask",
    "canMoveTask",
    "canDeleteTask",
    "canDeclineTask",
    "isTeamLead",
    "canCreateSprintPlanning",
    "canStartSprint",
    "canEndSprint",
    "canDeleteSprint",
    "canViewTaskHistory",
    "allowedStages",
    "allowedTransitions",
    "createdAt"
  )
  SELECT
    gen_random_uuid()::text,
    p.id,
    r.id,
    r."name",
    r."description",
    r."isAdmin",
    r."isClient",
    r."canCreateTask",
    r."canModifyTask",
    r."canMoveTask",
    r."canDeleteTask",
    r."canDeclineTask",
    r."isTeamLead",
    r."canCreateSprintPlanning",
    r."canStartSprint",
    r."canEndSprint",
    r."canDeleteSprint",
    r."canViewTaskHistory",
    r."allowedStages",
    r."allowedTransitions",
    r."createdAt"
  FROM "ProjectRole" AS r
  CROSS JOIN "Project" AS p
  WHERE r."projectId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "ProjectRole" AS existing
      WHERE existing."projectId" = p.id AND existing."presetId" = r.id
    )
  RETURNING "id", "projectId", "presetId"
),
members AS (
  UPDATE "ProjectMember" AS m
  SET "roleId" = c."id"
  FROM copies AS c
  WHERE c."projectId" = m."projectId"
    AND c."presetId" = m."roleId"
  RETURNING m."id"
)
UPDATE "Invitation" AS i
SET "roleId" = c."id"
FROM copies AS c
WHERE c."projectId" = i."projectId"
  AND c."presetId" = i."roleId";
