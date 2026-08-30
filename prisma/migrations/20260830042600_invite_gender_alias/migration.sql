ALTER TABLE "PendingTeamInvite" ADD COLUMN IF NOT EXISTS "gender" "Gender";
ALTER TABLE "PendingTeamInvite" ADD COLUMN IF NOT EXISTS "excludeFromAlias" BOOLEAN NOT NULL DEFAULT false;
