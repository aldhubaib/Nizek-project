-- Invitees can be given a display name before they sign in.
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "name" TEXT;
