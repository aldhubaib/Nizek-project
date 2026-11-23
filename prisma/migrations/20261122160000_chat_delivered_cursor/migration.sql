-- Per-user delivery cursor for inbox threads (`project-{id}` | `conv-{id}`).
-- Nullable so existing rows need no backfill; lastReadAt implies delivered.
ALTER TABLE "ChatReadCursor" ADD COLUMN "lastDeliveredAt" TIMESTAMP(3);
