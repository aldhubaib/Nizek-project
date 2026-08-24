ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "internalReviewUserId" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_internalReviewUserId_fkey"
  FOREIGN KEY ("internalReviewUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
