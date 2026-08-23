-- CreateTable
CREATE TABLE "SprintTaskSnapshot" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "estimatedMinutes" INTEGER,

    CONSTRAINT "SprintTaskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintTaskSnapshot_sprintId_idx" ON "SprintTaskSnapshot"("sprintId");

-- CreateIndex
CREATE INDEX "SprintTaskSnapshot_taskId_idx" ON "SprintTaskSnapshot"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintTaskSnapshot_sprintId_taskId_key" ON "SprintTaskSnapshot"("sprintId", "taskId");

-- AddForeignKey
ALTER TABLE "SprintTaskSnapshot" ADD CONSTRAINT "SprintTaskSnapshot_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintTaskSnapshot" ADD CONSTRAINT "SprintTaskSnapshot_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
