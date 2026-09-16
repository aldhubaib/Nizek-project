-- Web push rewrite: subscription health columns, per-device state, and a
-- transactional outbox. Purely additive — existing rows and the running worker
-- keep working while the new code rolls out.

-- PushSubscription: delivery health + platform
ALTER TABLE "PushSubscription"
  ADD COLUMN "platform" TEXT,
  ADD COLUMN "failCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
  ADD COLUMN "lastFailureAt" TIMESTAMP(3),
  ADD COLUMN "lastFailureStatus" INTEGER,
  ADD COLUMN "vapidKeyHash" TEXT;

CREATE INDEX "PushSubscription_memberId_failCount_idx"
  ON "PushSubscription"("memberId", "failCount");

-- Backfill platform from the stored user agent where we can.
UPDATE "PushSubscription"
SET "platform" = CASE
  WHEN "userAgent" ~* 'iphone|ipad|ipod' THEN 'ios'
  WHEN "userAgent" ~* 'android' THEN 'android'
  WHEN "userAgent" IS NOT NULL THEN 'desktop'
  ELSE NULL
END
WHERE "platform" IS NULL;

-- PushDevice: last known client-side push state per install
CREATE TABLE "PushDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "platform" TEXT,
  "standalone" BOOLEAN,
  "permission" TEXT,
  "supportReason" TEXT,
  "hasSubscription" BOOLEAN NOT NULL DEFAULT false,
  "registered" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "lastReason" TEXT,
  "lastDetail" TEXT,
  "userAgent" TEXT,
  "appBuild" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastEnabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDevice_userId_deviceId_key" ON "PushDevice"("userId", "deviceId");
CREATE INDEX "PushDevice_enabled_lastSeenAt_idx" ON "PushDevice"("enabled", "lastSeenAt");
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");

ALTER TABLE "PushDevice"
  ADD CONSTRAINT "PushDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PushOutbox: pushes that must be delivered, dispatched to the queue
CREATE TABLE "PushOutbox" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "recipientIds" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatchedAt" TIMESTAMP(3),

  CONSTRAINT "PushOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushOutbox_batchId_key" ON "PushOutbox"("batchId");
CREATE INDEX "PushOutbox_dispatchedAt_createdAt_idx" ON "PushOutbox"("dispatchedAt", "createdAt");
