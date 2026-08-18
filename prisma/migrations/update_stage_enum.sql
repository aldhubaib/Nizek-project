-- Migration: Update Stage enum from 4 values to 8 values
-- Old: TODO, IN_PROGRESS, REVIEW, DONE
-- New: NEW_REQUEST, CLARIFICATION, READY_FOR_DEV, IN_DEVELOPMENT, INTERNAL_REVIEW, CLIENT_REVIEW, READY_FOR_RELEASE, DONE

-- Step 1: Add new enum values
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'NEW_REQUEST';
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'CLARIFICATION';
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'READY_FOR_DEV';
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'IN_DEVELOPMENT';
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'INTERNAL_REVIEW';
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'CLIENT_REVIEW';
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'READY_FOR_RELEASE';

-- Step 2: Migrate existing tasks to new stages
UPDATE "Task" SET "stage" = 'NEW_REQUEST' WHERE "stage" = 'TODO';
UPDATE "Task" SET "stage" = 'IN_DEVELOPMENT' WHERE "stage" = 'IN_PROGRESS';
UPDATE "Task" SET "stage" = 'INTERNAL_REVIEW' WHERE "stage" = 'REVIEW';
-- DONE stays as DONE, no change needed

-- Step 3: Recreate the enum without old values
-- PostgreSQL doesn't support removing enum values directly,
-- so we rename the old type, create a new one, and swap.
ALTER TYPE "Stage" RENAME TO "Stage_old";

CREATE TYPE "Stage" AS ENUM (
  'NEW_REQUEST',
  'CLARIFICATION',
  'READY_FOR_DEV',
  'IN_DEVELOPMENT',
  'INTERNAL_REVIEW',
  'CLIENT_REVIEW',
  'READY_FOR_RELEASE',
  'DONE'
);

-- Update the column to use the new enum type
ALTER TABLE "Task"
  ALTER COLUMN "stage" TYPE "Stage" USING "stage"::text::"Stage";

-- Drop the old enum type
DROP TYPE "Stage_old";

-- Step 4: Update the index (Prisma expects this composite index)
DROP INDEX IF EXISTS "Task_projectId_stage_idx";
CREATE INDEX "Task_projectId_stage_idx" ON "Task"("projectId", "stage");

-- ─── Priority: enum → integer (1-10) ───────────────────
-- Step 5: Add a temporary integer column
ALTER TABLE "Task" ADD COLUMN "priority_int" INTEGER;

-- Step 6: Map old enum values to numbers
UPDATE "Task" SET "priority_int" = CASE
  WHEN "priority" = 'LOW' THEN 2
  WHEN "priority" = 'MEDIUM' THEN 5
  WHEN "priority" = 'HIGH' THEN 8
  WHEN "priority" = 'URGENT' THEN 10
  ELSE 5
END;

-- Step 7: Drop old column, rename new one
ALTER TABLE "Task" DROP COLUMN "priority";
ALTER TABLE "Task" RENAME COLUMN "priority_int" TO "priority";
ALTER TABLE "Task" ALTER COLUMN "priority" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "priority" SET DEFAULT 5;

-- Step 8: Drop the Priority enum
DROP TYPE IF EXISTS "Priority";
