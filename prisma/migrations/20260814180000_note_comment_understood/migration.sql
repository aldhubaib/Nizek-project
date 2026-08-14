-- Per-user "understood" on a note comment thread.

ALTER TABLE "NoteCommentSubscriber" ADD COLUMN "understoodAt" TIMESTAMP(3);
