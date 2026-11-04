-- Soft delete + explicit edit marker for chat messages.
-- updatedAt is now the "changes since" cursor (edits, reactions and deletes
-- all bump it), so "edited" can no longer be derived from updatedAt alone.
ALTER TABLE "Message" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Before this migration only body edits moved updatedAt (the old UI used a
-- 2-second gap as the "edited" signal), so carry that over once.
UPDATE "Message"
SET "editedAt" = "updatedAt"
WHERE "updatedAt" - "createdAt" > INTERVAL '2 seconds';

CREATE INDEX "Message_taskId_updatedAt_idx" ON "Message"("taskId", "updatedAt");
CREATE INDEX "Message_projectId_updatedAt_idx" ON "Message"("projectId", "updatedAt");
CREATE INDEX "Message_conversationId_updatedAt_idx" ON "Message"("conversationId", "updatedAt");
-- Inbox "did anything change since X" probe.
CREATE INDEX "Message_updatedAt_idx" ON "Message"("updatedAt");
