-- Transactional outbox for chat events (live broadcast + notifications), so a
-- committed message can never lose its fan-out to a Centrifugo hiccup or a
-- replica restart. Purely additive.

CREATE TABLE "MessageEvent" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,

  CONSTRAINT "MessageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageEvent_processedAt_createdAt_idx"
  ON "MessageEvent"("processedAt", "createdAt");
