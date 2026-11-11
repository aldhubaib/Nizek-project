-- Plain text used by chat search. Written by the app on send and edit.
-- This backfill covers ordinary messages. Card payloads (they start with
-- <!--) are filled by scripts/backfill-message-search.ts, which knows how
-- to turn a card into the sentence a person actually reads.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Message" ADD COLUMN "searchText" TEXT;

UPDATE "Message"
SET "searchText" = left(
  trim(
    regexp_replace(
      regexp_replace("body", '@\[([^\]]+)\]\([^)]+\)', '@\1', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  ),
  20000
)
WHERE "deletedAt" IS NULL
  AND "body" NOT LIKE '%<!--%';

CREATE INDEX "Message_searchText_trgm_idx"
  ON "Message"
  USING GIN ("searchText" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
