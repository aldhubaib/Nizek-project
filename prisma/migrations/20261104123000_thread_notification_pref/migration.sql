-- Per-thread notification level (all / mentions / none) replaces the binary
-- MutedThread. Existing mutes become level "none" so nobody who muted a thread
-- starts getting notified again.

CREATE TABLE "ThreadNotificationPref" (
  "userId" TEXT NOT NULL,
  "threadKey" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ThreadNotificationPref_pkey" PRIMARY KEY ("userId", "threadKey")
);

CREATE INDEX "ThreadNotificationPref_threadKey_idx" ON "ThreadNotificationPref"("threadKey");

ALTER TABLE "ThreadNotificationPref"
  ADD CONSTRAINT "ThreadNotificationPref_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ThreadNotificationPref" ("userId", "threadKey", "level", "updatedAt")
SELECT "userId", "threadKey", 'none', "createdAt"
FROM "MutedThread"
ON CONFLICT DO NOTHING;

-- "MutedThread" is intentionally kept for now (expand/contract): the web
-- replicas still running the previous release read it during the deploy
-- rollover, and dropping it here would make their notification fan-out throw.
-- The new code no longer touches it. Drop it in a later migration once no
-- old replica can be running.
