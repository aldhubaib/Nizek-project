-- Role that receives tasks when they enter Internal Review.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "internalReviewRoleId" TEXT;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_internalReviewRoleId_fkey"
  FOREIGN KEY ("internalReviewRoleId") REFERENCES "ProjectRole"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
