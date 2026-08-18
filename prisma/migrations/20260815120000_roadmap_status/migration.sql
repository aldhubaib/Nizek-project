-- Roadmap columns: Planned, Next, Progress, Shipped.
-- Completed deadline notes land in Shipped; everything else starts in Planned.

CREATE TYPE "RoadmapStatus" AS ENUM ('PLANNED', 'NEXT', 'PROGRESS', 'SHIPPED');

ALTER TABLE "MeetingNote" ADD COLUMN "roadmapStatus" "RoadmapStatus" NOT NULL DEFAULT 'PLANNED';

UPDATE "MeetingNote"
SET "roadmapStatus" = 'SHIPPED'
WHERE "noteType" = 'DEADLINE' AND "completedAt" IS NOT NULL;

CREATE INDEX "MeetingNote_noteType_roadmapStatus_idx" ON "MeetingNote"("noteType", "roadmapStatus");
