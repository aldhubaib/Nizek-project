-- Team Lead moves from a per-member toggle to a role capability: roles marked
-- isTeamLead grant full-project dashboard visibility to every member holding
-- that role. The per-member flag is dropped.
ALTER TABLE "ProjectRole" ADD COLUMN IF NOT EXISTS "isTeamLead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectMember" DROP COLUMN IF EXISTS "isTeamLead";
