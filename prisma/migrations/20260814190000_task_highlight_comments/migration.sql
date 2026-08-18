-- Highlight comment threads on task descriptions (same inbox pattern as notes).

CREATE TABLE "TaskHighlightThread" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "quoteText" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHighlightThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskHighlightThread_conversationId_key" ON "TaskHighlightThread"("conversationId");
CREATE INDEX "TaskHighlightThread_taskId_idx" ON "TaskHighlightThread"("taskId");

ALTER TABLE "TaskHighlightThread" ADD CONSTRAINT "TaskHighlightThread_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskHighlightThread" ADD CONSTRAINT "TaskHighlightThread_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskHighlightThread" ADD CONSTRAINT "TaskHighlightThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskHighlightComment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHighlightComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskHighlightComment_messageId_key" ON "TaskHighlightComment"("messageId");
CREATE INDEX "TaskHighlightComment_threadId_idx" ON "TaskHighlightComment"("threadId");

ALTER TABLE "TaskHighlightComment" ADD CONSTRAINT "TaskHighlightComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TaskHighlightThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskHighlightComment" ADD CONSTRAINT "TaskHighlightComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskHighlightMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskHighlightMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskHighlightMention_commentId_userId_key" ON "TaskHighlightMention"("commentId", "userId");
CREATE INDEX "TaskHighlightMention_userId_idx" ON "TaskHighlightMention"("userId");

ALTER TABLE "TaskHighlightMention" ADD CONSTRAINT "TaskHighlightMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskHighlightComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskHighlightMention" ADD CONSTRAINT "TaskHighlightMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskHighlightSubscriber" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "understoodAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHighlightSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskHighlightSubscriber_threadId_userId_key" ON "TaskHighlightSubscriber"("threadId", "userId");
CREATE INDEX "TaskHighlightSubscriber_userId_idx" ON "TaskHighlightSubscriber"("userId");

ALTER TABLE "TaskHighlightSubscriber" ADD CONSTRAINT "TaskHighlightSubscriber_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TaskHighlightThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskHighlightSubscriber" ADD CONSTRAINT "TaskHighlightSubscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
