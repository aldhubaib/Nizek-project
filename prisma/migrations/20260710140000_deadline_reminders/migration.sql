-- Deadline reminder tracking + query index for incomplete deadlines.

CREATE TABLE IF NOT EXISTS "DeadlineReminderLog" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "offsetDays" INTEGER NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeadlineReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeadlineReminderLog_noteId_offsetDays_key"
  ON "DeadlineReminderLog"("noteId", "offsetDays");

CREATE INDEX IF NOT EXISTS "DeadlineReminderLog_noteId_idx"
  ON "DeadlineReminderLog"("noteId");

DO $$ BEGIN
  ALTER TABLE "DeadlineReminderLog"
    ADD CONSTRAINT "DeadlineReminderLog_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "MeetingNote"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "MeetingNote_noteType_completedAt_dueDate_idx"
  ON "MeetingNote"("noteType", "completedAt", "dueDate");
