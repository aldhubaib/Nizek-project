-- CreateTable
CREATE TABLE "VaultFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultFolder_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "VaultCredential" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "VaultFolder_projectId_name_key" ON "VaultFolder"("projectId", "name");

-- CreateIndex
CREATE INDEX "VaultFolder_projectId_idx" ON "VaultFolder"("projectId");

-- CreateIndex
CREATE INDEX "VaultCredential_projectId_folderId_idx" ON "VaultCredential"("projectId", "folderId");

-- AddForeignKey
ALTER TABLE "VaultFolder" ADD CONSTRAINT "VaultFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultFolder" ADD CONSTRAINT "VaultFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "VaultFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
