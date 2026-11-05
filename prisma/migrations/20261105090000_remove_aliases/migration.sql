-- Remove the alias mechanism. Clients now see staff by their real names and
-- photos everywhere, so the alias pool, the per-project assignments, the
-- per-account and per-project exceptions, and the admin kill switch all go.
--
-- Gender stays: it is a member profile field in its own right. It is no longer
-- required anywhere, since the only reason it had to be set was to pick which
-- alias pool to draw from.
--
-- This drops data. Every alias and every assignment is gone once this runs.

DROP TABLE IF EXISTS "AliasAssignment";
DROP TABLE IF EXISTS "Alias";

ALTER TABLE "User" DROP COLUMN IF EXISTS "excludeFromAlias";
ALTER TABLE "PendingTeamInvite" DROP COLUMN IF EXISTS "excludeFromAlias";
ALTER TABLE "ProjectMember" DROP COLUMN IF EXISTS "showRealName";
ALTER TABLE "AppSettings" DROP COLUMN IF EXISTS "aliasesEnabled";
