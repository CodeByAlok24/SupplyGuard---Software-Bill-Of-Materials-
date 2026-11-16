-- CreateEnum
CREATE TYPE "SloSource" AS ENUM ('MANUAL');

-- CreateTable
CREATE TABLE "ServiceLevelObjective" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "indicatorName" TEXT NOT NULL,
    "observedValue" DOUBLE PRECISION,
    "windowDays" INTEGER,
    "observedAt" TIMESTAMP(3),
    "source" "SloSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceLevelObjective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceLevelObjective_workspaceId_service_environment_idx" ON "ServiceLevelObjective"("workspaceId", "service", "environment");

-- CreateIndex
CREATE INDEX "ServiceLevelObjective_workspaceId_createdAt_idx" ON "ServiceLevelObjective"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLevelObjective_workspaceId_projectId_service_environ_key" ON "ServiceLevelObjective"("workspaceId", "projectId", "service", "environment", "name");

-- AddForeignKey
ALTER TABLE "ServiceLevelObjective" ADD CONSTRAINT "ServiceLevelObjective_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLevelObjective" ADD CONSTRAINT "ServiceLevelObjective_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLevelObjective" ADD CONSTRAINT "ServiceLevelObjective_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
