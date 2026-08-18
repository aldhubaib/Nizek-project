-- Notification real-time / multi-device overhaul.
-- Idempotent so it is safe against databases that already have these columns.

-- Track when a notification was read (for cross-device read sync + auditing).
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

-- Per-device push subscription metadata for presence-aware push suppression.
ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

CREATE INDEX IF NOT EXISTS "PushSubscription_memberId_deviceId_idx"
  ON "PushSubscription"("memberId", "deviceId");
