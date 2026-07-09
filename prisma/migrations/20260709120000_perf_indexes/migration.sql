-- Performance indexes for hot-path queries (funnels, board, admin lists, auto-assign).
-- Idempotent so this is safe against databases that already have some indexes.

-- User
CREATE INDEX IF NOT EXISTS "User_systemRole_idx" ON "User"("systemRole");
CREATE INDEX IF NOT EXISTS "User_blocked_idx" ON "User"("blocked");

-- ProjectMember
CREATE INDEX IF NOT EXISTS "ProjectMember_projectId_role_idx" ON "ProjectMember"("projectId", "role");

-- Contract
CREATE INDEX IF NOT EXISTS "Contract_endDate_idx" ON "Contract"("endDate");

-- Task
CREATE INDEX IF NOT EXISTS "Task_stage_archivedAt_idx" ON "Task"("stage", "archivedAt");
CREATE INDEX IF NOT EXISTS "Task_updatedAt_idx" ON "Task"("updatedAt");
CREATE INDEX IF NOT EXISTS "Task_startedAt_idx" ON "Task"("startedAt");

-- TaskActivity
CREATE INDEX IF NOT EXISTS "TaskActivity_action_createdAt_idx" ON "TaskActivity"("action", "createdAt");

-- Message
CREATE INDEX IF NOT EXISTS "Message_authorId_idx" ON "Message"("authorId");
