import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
CREATE TABLE IF NOT EXISTS "CommentAttachment" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentAttachment_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CommentAttachment_commentId_fkey'
  ) THEN
    ALTER TABLE "CommentAttachment"
      ADD CONSTRAINT "CommentAttachment_commentId_fkey"
      FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CommentAttachment_commentId_idx"
  ON "CommentAttachment"("commentId");

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "maxPipelineTasks" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "PendingTeamInvite"
  ADD COLUMN IF NOT EXISTS "firstName" TEXT;

ALTER TABLE "PendingTeamInvite"
  ADD COLUMN IF NOT EXISTS "lastName" TEXT;
`;

try {
  await pool.query(SQL);
  console.log("[ensure-tables] CommentAttachment table ready");
} catch (err) {
  console.error("[ensure-tables] Failed:", err.message);
} finally {
  await pool.end();
}
