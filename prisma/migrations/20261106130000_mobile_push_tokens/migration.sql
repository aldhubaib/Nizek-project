-- Expo push tokens for the native mobile app (mobile/). One row per install.
-- The push worker reads these next to PushSubscription (web push) for every
-- outbox job, so a notification reaches phones and browsers alike.
--
-- Every statement is safe to run again after a failure.

CREATE TABLE IF NOT EXISTS "MobilePushToken" (
  "id"            TEXT NOT NULL,
  "memberId"      TEXT NOT NULL,
  "token"         TEXT NOT NULL,
  "deviceId"      TEXT NOT NULL,
  "platform"      TEXT NOT NULL,
  "deviceName"    TEXT,
  "appVersion"    TEXT,
  "failCount"     INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastError"     TEXT,
  "lastSeenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MobilePushToken_token_key" ON "MobilePushToken"("token");
CREATE INDEX IF NOT EXISTS "MobilePushToken_memberId_idx" ON "MobilePushToken"("memberId");
CREATE INDEX IF NOT EXISTS "MobilePushToken_memberId_deviceId_idx" ON "MobilePushToken"("memberId", "deviceId");
CREATE INDEX IF NOT EXISTS "MobilePushToken_memberId_failCount_idx" ON "MobilePushToken"("memberId", "failCount");

ALTER TABLE "MobilePushToken" DROP CONSTRAINT IF EXISTS "MobilePushToken_memberId_fkey";
ALTER TABLE "MobilePushToken"
  ADD CONSTRAINT "MobilePushToken_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
