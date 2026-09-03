-- The client user agreement: one global document, versioned, with a row per
-- client per version recording that they accepted it.
--
-- No version is inserted. Nothing gates any client until an admin publishes the
-- first one, so this migration cannot lock anybody out.

CREATE TABLE "ClientAgreementVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAgreementVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAgreementAcceptance" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAgreementAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientAgreementVersion_version_key" ON "ClientAgreementVersion"("version");
CREATE INDEX "ClientAgreementVersion_publishedAt_idx" ON "ClientAgreementVersion"("publishedAt");

-- At most one draft at a time. Expression index over a constant so every
-- unpublished row collides with every other unpublished row, while published
-- rows are outside the index entirely and can accumulate without limit.
CREATE UNIQUE INDEX "ClientAgreementVersion_single_draft"
    ON "ClientAgreementVersion" ((true))
    WHERE "publishedAt" IS NULL;

CREATE UNIQUE INDEX "ClientAgreementAcceptance_versionId_userId_key"
    ON "ClientAgreementAcceptance"("versionId", "userId");
CREATE INDEX "ClientAgreementAcceptance_userId_idx" ON "ClientAgreementAcceptance"("userId");
CREATE INDEX "ClientAgreementAcceptance_versionId_idx" ON "ClientAgreementAcceptance"("versionId");

ALTER TABLE "ClientAgreementVersion"
    ADD CONSTRAINT "ClientAgreementVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientAgreementAcceptance"
    ADD CONSTRAINT "ClientAgreementAcceptance_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "ClientAgreementVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientAgreementAcceptance"
    ADD CONSTRAINT "ClientAgreementAcceptance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
