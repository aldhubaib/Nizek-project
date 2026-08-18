-- AlterTable
ALTER TABLE "EquityMetric" ADD COLUMN     "formulaOp" TEXT,
ADD COLUMN     "group" TEXT NOT NULL DEFAULT 'PERFORMANCE',
ADD COLUMN     "leftId" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rightId" TEXT;

-- CreateTable
CREATE TABLE "EquityFinancialValue" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "numberValue" DOUBLE PRECISION,
    "dateValue" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityFinancialValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityFinancialValue_metricId_idx" ON "EquityFinancialValue"("metricId");

-- CreateIndex
CREATE UNIQUE INDEX "EquityFinancialValue_reportId_metricId_key" ON "EquityFinancialValue"("reportId", "metricId");

-- CreateIndex
CREATE INDEX "EquityMetric_group_order_idx" ON "EquityMetric"("group", "order");

-- AddForeignKey
ALTER TABLE "EquityMetric" ADD CONSTRAINT "EquityMetric_leftId_fkey" FOREIGN KEY ("leftId") REFERENCES "EquityMetric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityMetric" ADD CONSTRAINT "EquityMetric_rightId_fkey" FOREIGN KEY ("rightId") REFERENCES "EquityMetric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityFinancialValue" ADD CONSTRAINT "EquityFinancialValue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EquityFinancialReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityFinancialValue" ADD CONSTRAINT "EquityFinancialValue_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "EquityMetric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
