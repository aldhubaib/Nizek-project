-- SECOND PUSH ONLY. Move this folder into prisma/migrations once the release
-- that stopped reading these columns (20261106000000_project_roles) is the only
-- one running on Railway. Deploying it together with that release would break
-- the previous replica while the two overlap.
--
-- Drops the internal-review assignee and the pipeline limit from Project. No
-- live project had a reviewer set or a non-default limit, so nothing is lost.

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_internalReviewRoleId_fkey";
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_internalReviewUserId_fkey";

ALTER TABLE "Project" DROP COLUMN IF EXISTS "internalReviewRoleId";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "internalReviewUserId";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "maxPipelineTasks";
