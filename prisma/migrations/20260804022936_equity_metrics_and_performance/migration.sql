-- CreateTable
CREATE TABLE "EquityMetric" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NUMBER',
    "unit" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquityPerformanceEntry" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityPerformanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquityPerformanceValue" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "numberValue" DOUBLE PRECISION,
    "dateValue" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityPerformanceValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquityMetric_name_key" ON "EquityMetric"("name");

-- CreateIndex
CREATE INDEX "EquityPerformanceEntry_portfolioId_recordedOn_idx" ON "EquityPerformanceEntry"("portfolioId", "recordedOn");

-- CreateIndex
CREATE INDEX "EquityPerformanceValue_metricId_idx" ON "EquityPerformanceValue"("metricId");

-- CreateIndex
CREATE UNIQUE INDEX "EquityPerformanceValue_entryId_metricId_key" ON "EquityPerformanceValue"("entryId", "metricId");

-- AddForeignKey
ALTER TABLE "EquityPerformanceEntry" ADD CONSTRAINT "EquityPerformanceEntry_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityPerformanceValue" ADD CONSTRAINT "EquityPerformanceValue_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "EquityPerformanceEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityPerformanceValue" ADD CONSTRAINT "EquityPerformanceValue_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "EquityMetric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
