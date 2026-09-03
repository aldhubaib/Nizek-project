-- App-wide switches an admin can flip at runtime, starting with the one that
-- turns the whole alias mechanism off.
--
-- No row is inserted. A missing row reads as every switch at its default, and
-- the default for aliasesEnabled is on — so this migration cannot change how
-- the app behaves, and an install that never touches the admin toggle keeps
-- masking exactly as before.

CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "aliasesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
