-- Product is no longer a meeting-note type. Existing Product notes become
-- meeting notes so the enum value can be dropped.

UPDATE "MeetingNote" SET "noteType" = 'MEETING_NOTE' WHERE "noteType" = 'PRODUCT';

ALTER TYPE "NoteType" RENAME TO "NoteType_old";
CREATE TYPE "NoteType" AS ENUM ('MEETING_NOTE', 'DECISION', 'DEADLINE', 'FEATURE', 'ENHANCEMENT', 'BUG', 'REPORTED_BUG', 'DESIGN');
ALTER TABLE "MeetingNote" ALTER COLUMN "noteType" DROP DEFAULT;
ALTER TABLE "MeetingNote" ALTER COLUMN "noteType" TYPE "NoteType" USING ("noteType"::text::"NoteType");
ALTER TABLE "MeetingNote" ALTER COLUMN "noteType" SET DEFAULT 'MEETING_NOTE';
DROP TYPE "NoteType_old";
