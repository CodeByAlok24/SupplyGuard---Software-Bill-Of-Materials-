-- CreateTable
CREATE TABLE "SbomUpload" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'cyclonedx-json',
    "content" JSONB NOT NULL,
    "componentCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SbomUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SbomComparison" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lockfileScanJobId" TEXT,
    "sbomUploadId" TEXT,
    "coverageScore" DOUBLE PRECISION NOT NULL,
    "matchedComponents" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SbomComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SbomUpload_workspaceId_createdAt_idx" ON "SbomUpload"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SbomUpload_projectId_createdAt_idx" ON "SbomUpload"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "SbomComparison_workspaceId_createdAt_idx" ON "SbomComparison"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SbomComparison_projectId_createdAt_idx" ON "SbomComparison"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "SbomUpload" ADD CONSTRAINT "SbomUpload_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SbomComparison" ADD CONSTRAINT "SbomComparison_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SbomComparison" ADD CONSTRAINT "SbomComparison_sbomUploadId_fkey" FOREIGN KEY ("sbomUploadId") REFERENCES "SbomUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
