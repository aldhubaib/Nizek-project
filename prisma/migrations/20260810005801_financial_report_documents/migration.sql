-- CreateTable
CREATE TABLE "EquityFinancialDocument" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquityFinancialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityFinancialDocument_reportId_idx" ON "EquityFinancialDocument"("reportId");

-- AddForeignKey
ALTER TABLE "EquityFinancialDocument" ADD CONSTRAINT "EquityFinancialDocument_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EquityFinancialReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
