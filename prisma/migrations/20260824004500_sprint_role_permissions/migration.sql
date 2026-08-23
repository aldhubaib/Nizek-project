-- Sprint lifecycle permissions on project roles.
ALTER TABLE "ProjectRole" ADD COLUMN IF NOT EXISTS "canCreateSprintPlanning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectRole" ADD COLUMN IF NOT EXISTS "canStartSprint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectRole" ADD COLUMN IF NOT EXISTS "canEndSprint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectRole" ADD COLUMN IF NOT EXISTS "canDeleteSprint" BOOLEAN NOT NULL DEFAULT false;

-- Keep access for roles that already manage sprints today (modify / lead / admin).
UPDATE "ProjectRole"
SET
  "canCreateSprintPlanning" = true,
  "canStartSprint" = true,
  "canEndSprint" = true,
  "canDeleteSprint" = true
WHERE "isAdmin" = true OR "isTeamLead" = true OR "canModifyTask" = true;
