-- Files on a board card, built in rather than configured per card type.

CREATE TABLE "BoardCardAttachment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardCardAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardCardAttachment_cardId_createdAt_idx" ON "BoardCardAttachment"("cardId", "createdAt");
CREATE INDEX "BoardCardAttachment_uploadedById_idx" ON "BoardCardAttachment"("uploadedById");

ALTER TABLE "BoardCardAttachment" ADD CONSTRAINT "BoardCardAttachment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardCardAttachment" ADD CONSTRAINT "BoardCardAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
