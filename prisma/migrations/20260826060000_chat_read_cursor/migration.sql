-- Per-user last-read cursor for inbox threads (project-{id} | conv-{id}).
-- Unread badges count messages after lastReadAt, not mention notifications.

CREATE TABLE "ChatReadCursor" (
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadCursor_pkey" PRIMARY KEY ("userId","threadId")
);

ALTER TABLE "ChatReadCursor" ADD CONSTRAINT "ChatReadCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DMs / client rooms already track lastReadAt on the participant row.
INSERT INTO "ChatReadCursor" ("userId", "threadId", "lastReadAt", "updatedAt")
SELECT p."memberId",
       'conv-' || p."conversationId",
       p."lastReadAt",
       CURRENT_TIMESTAMP
FROM "ConversationParticipant" p
WHERE p."lastReadAt" IS NOT NULL
ON CONFLICT ("userId", "threadId") DO NOTHING;

-- Preserve currently-unread mention badges: cursor sits just before the oldest
-- unread notification so every later message in that thread counts.
INSERT INTO "ChatReadCursor" ("userId", "threadId", "lastReadAt", "updatedAt")
SELECT sub."recipientId",
       sub."threadId",
       MIN(sub."createdAt") - INTERVAL '1 millisecond',
       CURRENT_TIMESTAMP
FROM (
  SELECT n."recipientId",
         substring(n."linkUrl" from '/dashboard/messages/((?:conv|project)-[^/?]+)') AS "threadId",
         n."createdAt"
  FROM "Notification" n
  WHERE n.read = false
    AND n."linkUrl" LIKE '/dashboard/messages/%'
) sub
WHERE sub."threadId" IS NOT NULL
GROUP BY sub."recipientId", sub."threadId"
ON CONFLICT ("userId", "threadId") DO NOTHING;
