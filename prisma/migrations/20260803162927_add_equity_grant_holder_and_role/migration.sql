-- AlterTable
ALTER TABLE "EquityGrant" ADD COLUMN     "holderId" TEXT,
ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "EquityRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquityRole_name_key" ON "EquityRole"("name");

-- CreateIndex
CREATE INDEX "EquityGrant_holderId_idx" ON "EquityGrant"("holderId");

-- CreateIndex
CREATE INDEX "EquityGrant_roleId_idx" ON "EquityGrant"("roleId");

-- AddForeignKey
ALTER TABLE "EquityGrant" ADD CONSTRAINT "EquityGrant_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "EquityHolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityGrant" ADD CONSTRAINT "EquityGrant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "EquityRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
