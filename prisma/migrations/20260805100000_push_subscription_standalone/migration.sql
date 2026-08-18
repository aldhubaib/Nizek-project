-- Track whether each push subscription came from an installed PWA
-- (display-mode: standalone) or a browser tab, plus when it was last synced.
ALTER TABLE "PushSubscription" ADD COLUMN "standalone" BOOLEAN;
ALTER TABLE "PushSubscription" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
