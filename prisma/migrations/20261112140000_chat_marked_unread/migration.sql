-- A personal "come back to this" flag. lastReadAt is unchanged, so read receipts stay put.
ALTER TABLE "ChatReadCursor" ADD COLUMN "markedUnread" BOOLEAN NOT NULL DEFAULT false;
