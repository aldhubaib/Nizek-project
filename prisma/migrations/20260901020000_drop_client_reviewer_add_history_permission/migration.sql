-- Client review moved from per-task to per-sprint and became optional, so the
-- per-task reviewer and the project-level default reviewer no longer gate
-- anything. Drop them rather than leave a dangling ownership field.
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_clientReviewerId_fkey";
DROP INDEX IF EXISTS "Task_clientReviewerId_idx";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "clientReviewerId";

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_defaultClientReviewerId_fkey";
DROP INDEX IF EXISTS "Project_defaultClientReviewerId_idx";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "defaultClientReviewerId";

-- The lifecycle timeline names actors and their durations, so it is gated on a
-- permission rather than a role check.
ALTER TABLE "ProjectRole" ADD COLUMN "canViewTaskHistory" BOOLEAN NOT NULL DEFAULT false;

-- Internal access is unchanged on day one; only client roles start locked.
UPDATE "ProjectRole" SET "canViewTaskHistory" = true WHERE "isClient" = false OR "isAdmin" = true;
