-- Who is responsible for a board card, plus comments on workflow records.

ALTER TABLE "BoardRecord" ADD COLUMN "assigneeId" TEXT;

CREATE INDEX "BoardRecord_assigneeId_idx" ON "BoardRecord"("assigneeId");

ALTER TABLE "BoardRecord" ADD CONSTRAINT "BoardRecord_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RecordComment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecordCommentAttachment" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordCommentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecordCommentMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "RecordCommentMention_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordComment_entityType_recordId_idx" ON "RecordComment"("entityType", "recordId");
CREATE INDEX "RecordComment_projectId_idx" ON "RecordComment"("projectId");
CREATE INDEX "RecordCommentAttachment_commentId_idx" ON "RecordCommentAttachment"("commentId");
CREATE UNIQUE INDEX "RecordCommentMention_commentId_userId_key" ON "RecordCommentMention"("commentId", "userId");
CREATE INDEX "RecordCommentMention_userId_idx" ON "RecordCommentMention"("userId");

ALTER TABLE "RecordComment" ADD CONSTRAINT "RecordComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordCommentAttachment" ADD CONSTRAINT "RecordCommentAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "RecordComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordCommentMention" ADD CONSTRAINT "RecordCommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "RecordComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordCommentMention" ADD CONSTRAINT "RecordCommentMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
