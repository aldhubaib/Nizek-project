-- Two-way note↔task links, plus highlighted comment threads on notes.

CREATE TABLE "NoteTaskLink" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "quoteText" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteTaskLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteTaskLink_noteId_taskId_key" ON "NoteTaskLink"("noteId", "taskId");
CREATE INDEX "NoteTaskLink_noteId_idx" ON "NoteTaskLink"("noteId");
CREATE INDEX "NoteTaskLink_taskId_idx" ON "NoteTaskLink"("taskId");

ALTER TABLE "NoteTaskLink" ADD CONSTRAINT "NoteTaskLink_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteTaskLink" ADD CONSTRAINT "NoteTaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteTaskLink" ADD CONSTRAINT "NoteTaskLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "NoteTaskLink" ("id", "noteId", "taskId", "createdById", "createdAt")
SELECT 'ntl_' || "id", "id", "taskId", "authorId", "createdAt"
FROM "MeetingNote"
WHERE "taskId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE "NoteCommentThread" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "quoteText" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteCommentThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteCommentThread_conversationId_key" ON "NoteCommentThread"("conversationId");
CREATE INDEX "NoteCommentThread_noteId_idx" ON "NoteCommentThread"("noteId");

ALTER TABLE "NoteCommentThread" ADD CONSTRAINT "NoteCommentThread_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteCommentThread" ADD CONSTRAINT "NoteCommentThread_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoteCommentThread" ADD CONSTRAINT "NoteCommentThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NoteComment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteComment_messageId_key" ON "NoteComment"("messageId");
CREATE INDEX "NoteComment_threadId_idx" ON "NoteComment"("threadId");

ALTER TABLE "NoteComment" ADD CONSTRAINT "NoteComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "NoteCommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteComment" ADD CONSTRAINT "NoteComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NoteCommentMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "NoteCommentMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteCommentMention_commentId_userId_key" ON "NoteCommentMention"("commentId", "userId");
CREATE INDEX "NoteCommentMention_userId_idx" ON "NoteCommentMention"("userId");

ALTER TABLE "NoteCommentMention" ADD CONSTRAINT "NoteCommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "NoteComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteCommentMention" ADD CONSTRAINT "NoteCommentMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NoteCommentSubscriber" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteCommentSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteCommentSubscriber_threadId_userId_key" ON "NoteCommentSubscriber"("threadId", "userId");
CREATE INDEX "NoteCommentSubscriber_userId_idx" ON "NoteCommentSubscriber"("userId");

ALTER TABLE "NoteCommentSubscriber" ADD CONSTRAINT "NoteCommentSubscriber_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "NoteCommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteCommentSubscriber" ADD CONSTRAINT "NoteCommentSubscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
