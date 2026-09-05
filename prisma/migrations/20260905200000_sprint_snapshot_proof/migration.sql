-- Pin the proof that carried each task through review to the sprint that
-- reported it as delivered. Proof belongs to the task, so a task pulled back
-- out and re-proved in a later sprint would otherwise rewrite the closed
-- document of the sprint that already shipped it.
ALTER TABLE "SprintTaskSnapshot" ADD COLUMN "proofOfWorkId" TEXT;

ALTER TABLE "SprintTaskSnapshot"
  ADD CONSTRAINT "SprintTaskSnapshot_proofOfWorkId_fkey"
  FOREIGN KEY ("proofOfWorkId") REFERENCES "ProofOfWork"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SprintTaskSnapshot_proofOfWorkId_idx" ON "SprintTaskSnapshot"("proofOfWorkId");
