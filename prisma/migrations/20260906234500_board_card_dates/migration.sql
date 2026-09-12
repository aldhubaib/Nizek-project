-- Start and due dates on a board card, plus the hand-ticked "done" that tells
-- an overdue card from one that was due and finished.

ALTER TABLE "BoardCard" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "BoardCard" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "BoardCard" ADD COLUMN "dueDone" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "BoardCard_boardId_dueDate_idx" ON "BoardCard"("boardId", "dueDate");
