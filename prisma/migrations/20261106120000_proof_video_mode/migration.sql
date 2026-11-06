-- The "video bypass" setting becomes a per-project mode with three values.
--
--   SELF      whoever moves a task into Internal Review uploads its video
--   ASSIGNED  the same, or they hand the task to the members assigned as
--             uploaders, who record the video on their behalf
--   NONE      no video per task; the sprint review needs one before it ends
--
-- Every existing project gets SELF, which is what it did before. The members
-- flagged "canBypassProof" keep their flag and become the assigned uploaders
-- should a project switch to ASSIGNED, so nobody has to be set up twice.
--
-- Nothing is dropped. Prisma runs this statement by statement with no
-- transaction around it, so every step is safe to run again after a failure.

DO $$ BEGIN
  CREATE TYPE "ProofVideoMode" AS ENUM ('SELF', 'ASSIGNED', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "proofVideoMode" "ProofVideoMode" NOT NULL DEFAULT 'SELF';

-- Who attached a proof's videos when it was not the task's author.
ALTER TABLE "ProofOfWork" ADD COLUMN IF NOT EXISTS "uploadedById" TEXT;
ALTER TABLE "ProofOfWork" DROP CONSTRAINT IF EXISTS "ProofOfWork_uploadedById_fkey";
ALTER TABLE "ProofOfWork" ADD CONSTRAINT "ProofOfWork_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The recording of a sprint's review, kept on the sprint.
CREATE TABLE IF NOT EXISTS "SprintReviewVideo" (
  "id"           TEXT NOT NULL,
  "sprintId"     TEXT NOT NULL,
  "filename"     TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "fileSize"     INTEGER,
  "mimeType"     TEXT,
  "uploadedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SprintReviewVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SprintReviewVideo_sprintId_createdAt_idx"
  ON "SprintReviewVideo"("sprintId", "createdAt");

ALTER TABLE "SprintReviewVideo" DROP CONSTRAINT IF EXISTS "SprintReviewVideo_sprintId_fkey";
ALTER TABLE "SprintReviewVideo" ADD CONSTRAINT "SprintReviewVideo_sprintId_fkey"
  FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SprintReviewVideo" DROP CONSTRAINT IF EXISTS "SprintReviewVideo_uploadedById_fkey";
ALTER TABLE "SprintReviewVideo" ADD CONSTRAINT "SprintReviewVideo_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
