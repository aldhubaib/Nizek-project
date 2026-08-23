-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill existing closed sprints with their last update time
UPDATE "Sprint"
SET "completedAt" = "updatedAt"
WHERE "status" IN ('COMPLETED', 'PARTIALLY_COMPLETED')
  AND "completedAt" IS NULL;
