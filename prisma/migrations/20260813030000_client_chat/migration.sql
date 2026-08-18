-- Client chat: per-project client room isolated from internal project chat.

ALTER TABLE "Project" ADD COLUMN "clientChatEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Conversation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE "Conversation" ADD COLUMN "projectId" TEXT;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Conversation_projectId_kind_key" ON "Conversation"("projectId", "kind");
CREATE INDEX "Conversation_projectId_idx" ON "Conversation"("projectId");
CREATE INDEX "Conversation_kind_idx" ON "Conversation"("kind");
