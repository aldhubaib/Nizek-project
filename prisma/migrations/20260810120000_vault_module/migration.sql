-- Vault: project credentials with separate permissions and change history.

CREATE TABLE "VaultPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultCredential" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "passwordEnc" TEXT,
    "url" TEXT,
    "notesEnc" TEXT,
    "category" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultActivity" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultPermission_userId_projectId_key" ON "VaultPermission"("userId", "projectId");
CREATE INDEX "VaultPermission_userId_idx" ON "VaultPermission"("userId");
CREATE INDEX "VaultPermission_projectId_idx" ON "VaultPermission"("projectId");
CREATE INDEX "VaultCredential_projectId_deletedAt_idx" ON "VaultCredential"("projectId", "deletedAt");
CREATE INDEX "VaultCredential_deletedAt_idx" ON "VaultCredential"("deletedAt");
CREATE INDEX "VaultActivity_credentialId_createdAt_idx" ON "VaultActivity"("credentialId", "createdAt");

ALTER TABLE "VaultPermission" ADD CONSTRAINT "VaultPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultPermission" ADD CONSTRAINT "VaultPermission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultActivity" ADD CONSTRAINT "VaultActivity_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "VaultCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultActivity" ADD CONSTRAINT "VaultActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
