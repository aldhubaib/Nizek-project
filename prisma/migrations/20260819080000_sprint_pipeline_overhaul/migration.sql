-- Migration: Sprint Pipeline Overhaul
-- 1. Simplify Stage enum: remove READY_FOR_DEV, READY_FOR_RELEASE; rename NEW_REQUEST → BACKLOG
-- 2. Add Sprint + SprintItem models

-- ─── Part 1: Stage enum simplification ──────────────────

-- Step 1: Migrate task data to valid stages BEFORE altering the enum
UPDATE "Task" SET "stage" = 'IN_DEVELOPMENT' WHERE "stage" = 'READY_FOR_DEV';
UPDATE "Task" SET "stage" = 'DONE' WHERE "stage" = 'READY_FOR_RELEASE';

UPDATE "StageLog" SET "stage" = 'IN_DEVELOPMENT' WHERE "stage" = 'READY_FOR_DEV';
UPDATE "StageLog" SET "stage" = 'DONE' WHERE "stage" = 'READY_FOR_RELEASE';

-- Step 2: Rename NEW_REQUEST → BACKLOG
UPDATE "Task" SET "stage" = 'BACKLOG' WHERE "stage" = 'NEW_REQUEST';
UPDATE "StageLog" SET "stage" = 'BACKLOG' WHERE "stage" = 'NEW_REQUEST';

-- Step 3: Recreate the Stage enum with only the 6 valid values
ALTER TYPE "Stage" RENAME TO "Stage_old";

CREATE TYPE "Stage" AS ENUM (
  'BACKLOG',
  'CLARIFICATION',
  'IN_DEVELOPMENT',
  'INTERNAL_REVIEW',
  'CLIENT_REVIEW',
  'DONE'
);

ALTER TABLE "Task"
  ALTER COLUMN "stage" TYPE "Stage" USING "stage"::text::"Stage";

ALTER TABLE "StageLog"
  ALTER COLUMN "stage" TYPE "Stage" USING "stage"::text::"Stage";

DROP TYPE "Stage_old";

-- Rebuild indexes that reference stage
DROP INDEX IF EXISTS "Task_projectId_stage_idx";
CREATE INDEX "Task_projectId_stage_idx" ON "Task"("projectId", "stage");

DROP INDEX IF EXISTS "Task_stage_archivedAt_idx";
CREATE INDEX "Task_stage_archivedAt_idx" ON "Task"("stage", "archivedAt");

-- ─── Part 2: Sprint system ──────────────────────────────

-- SprintStatus enum
CREATE TYPE "SprintStatus" AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED');

-- Sprint model
CREATE TABLE "Sprint" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" "SprintStatus" NOT NULL DEFAULT 'PLANNING',
  "workingDays" INTEGER,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- SprintItem join table
CREATE TABLE "SprintItem" (
  "id" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "status" "RoadmapStatus" NOT NULL DEFAULT 'PLANNED',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SprintItem_pkey" PRIMARY KEY ("id")
);

-- Unique: one task per sprint
CREATE UNIQUE INDEX "SprintItem_sprintId_taskId_key" ON "SprintItem"("sprintId", "taskId");

-- Performance indexes
CREATE INDEX "Sprint_projectId_status_idx" ON "Sprint"("projectId", "status");
CREATE INDEX "SprintItem_sprintId_status_idx" ON "SprintItem"("sprintId", "status");

-- Foreign keys
ALTER TABLE "Sprint"
  ADD CONSTRAINT "Sprint_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SprintItem"
  ADD CONSTRAINT "SprintItem_sprintId_fkey"
  FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SprintItem"
  ADD CONSTRAINT "SprintItem_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
