-- Invited members can be pre-assigned to a team; applied on first sign-in.
ALTER TABLE "PendingTeamInvite" ADD COLUMN IF NOT EXISTS "teamId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PendingTeamInvite_teamId_fkey'
  ) THEN
    ALTER TABLE "PendingTeamInvite"
      ADD CONSTRAINT "PendingTeamInvite_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
