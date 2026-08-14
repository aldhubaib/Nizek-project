-- Per-user starred / important chat messages.

CREATE TABLE "ImportantMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportantMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportantMessage_messageId_userId_key" ON "ImportantMessage"("messageId", "userId");
CREATE INDEX "ImportantMessage_userId_createdAt_idx" ON "ImportantMessage"("userId", "createdAt");

ALTER TABLE "ImportantMessage" ADD CONSTRAINT "ImportantMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportantMessage" ADD CONSTRAINT "ImportantMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
