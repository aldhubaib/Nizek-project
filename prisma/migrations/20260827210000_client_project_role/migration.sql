-- Chat-only project role. Assigned users become CLIENT and only see client chat.
ALTER TABLE "ProjectRole" ADD COLUMN IF NOT EXISTS "isClient" BOOLEAN NOT NULL DEFAULT false;
