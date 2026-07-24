-- Per-project Team Lead flag: when set, the member sees all members' tasks and
-- late items for that project in the dashboard monitors (instead of only their own).
ALTER TABLE "ProjectMember" ADD COLUMN IF NOT EXISTS "isTeamLead" BOOLEAN NOT NULL DEFAULT false;
