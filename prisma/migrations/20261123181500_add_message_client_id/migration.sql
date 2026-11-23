ALTER TABLE "Message" ADD COLUMN "clientMessageId" TEXT;

CREATE UNIQUE INDEX "Message_authorId_clientMessageId_key" ON "Message"("authorId", "clientMessageId");
