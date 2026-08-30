-- Per-project exception to aliasing: this member is shown to the client under
-- their real name on this project only, and stays aliased on every other one.
-- Defaults to false, so existing memberships keep their alias.

ALTER TABLE "ProjectMember" ADD COLUMN IF NOT EXISTS "showRealName" BOOLEAN NOT NULL DEFAULT false;
