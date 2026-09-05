-- One document per sprint instead of a planning note and a review note.
--
-- Alone in its own migration on purpose: Postgres will not let a new enum value
-- be used in the transaction that adds it, and the merge in the next migration
-- writes rows with this value.
ALTER TYPE "NoteType" ADD VALUE 'SPRINT_DOC';
