-- Add ROADMAP to the NoteType enum
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'ROADMAP';

-- Migrate existing DEADLINE notes to ROADMAP
UPDATE "MeetingNote" SET "noteType" = 'ROADMAP' WHERE "noteType" = 'DEADLINE';
