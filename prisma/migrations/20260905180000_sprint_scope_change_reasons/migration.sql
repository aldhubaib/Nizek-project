-- Why a task joined a sprint that had already started, and why one left it.
-- Both are asked for at the moment it happens and reported in the sprint
-- document, which otherwise shows the scope changing with no explanation.
ALTER TABLE "Task" ADD COLUMN "unplannedReason" TEXT;
ALTER TABLE "SprintTaskSnapshot" ADD COLUMN "unplannedReason" TEXT;
