-- Notification reliability: push delivery audit log, per-user notification
-- preferences, thread mutes, and thread-scoped tags on Notification rows for
-- cross-device banner dismissal.

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "tag" TEXT;

CREATE TABLE IF NOT EXISTS "PushDeliveryLog" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "endpointHost" TEXT,
  "type" TEXT,
  "tag" TEXT,
  "ok" BOOLEAN NOT NULL,
  "statusCode" INTEGER,
  "error" TEXT,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PushDeliveryLog_recipientId_createdAt_idx"
  ON "PushDeliveryLog"("recipientId", "createdAt");

CREATE INDEX IF NOT EXISTS "PushDeliveryLog_ok_createdAt_idx"
  ON "PushDeliveryLog"("ok", "createdAt");

CREATE INDEX IF NOT EXISTS "PushDeliveryLog_createdAt_idx"
  ON "PushDeliveryLog"("createdAt");

DO $$ BEGIN
  ALTER TABLE "PushDeliveryLog"
    ADD CONSTRAINT "PushDeliveryLog_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "notifyMessages" BOOLEAN NOT NULL DEFAULT true,
  "notifyMentions" BOOLEAN NOT NULL DEFAULT true,
  "notifyRejections" BOOLEAN NOT NULL DEFAULT true,
  "notifyDeadlines" BOOLEAN NOT NULL DEFAULT true,
  "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key"
  ON "NotificationPreference"("userId");

DO $$ BEGIN
  ALTER TABLE "NotificationPreference"
    ADD CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MutedThread" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "threadKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MutedThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MutedThread_userId_threadKey_key"
  ON "MutedThread"("userId", "threadKey");

CREATE INDEX IF NOT EXISTS "MutedThread_userId_idx"
  ON "MutedThread"("userId");

DO $$ BEGIN
  ALTER TABLE "MutedThread"
    ADD CONSTRAINT "MutedThread_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
