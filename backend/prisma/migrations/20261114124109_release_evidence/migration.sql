-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('UNVERIFIED', 'USER_ASSERTED');

-- CreateTable
CREATE TABLE "ReleaseEvidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scanJobId" TEXT,
    "repositoryUrl" TEXT,
    "commitSha" TEXT,
    "sbomName" TEXT,
    "sbomFormat" TEXT,
    "sbomSerialNumber" TEXT,
    "sbomGeneratedAt" TIMESTAMP(3),
    "sbomDigest" TEXT,
    "artifactName" TEXT,
    "artifactDigest" TEXT,
    "buildProvider" TEXT,
    "buildWorkflow" TEXT,
    "buildRunId" TEXT,
    "buildRunUrl" TEXT,
    "deployService" TEXT,
    "deployEnvironment" TEXT,
    "deployRegion" TEXT,
    "deployAt" TIMESTAMP(3),
    "evidenceSource" "EvidenceSource" NOT NULL DEFAULT 'MANUAL',
    "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReleaseEvidence_workspaceId_createdAt_idx" ON "ReleaseEvidence"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ReleaseEvidence_projectId_createdAt_idx" ON "ReleaseEvidence"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ReleaseEvidence_scanJobId_idx" ON "ReleaseEvidence"("scanJobId");

-- AddForeignKey
ALTER TABLE "ReleaseEvidence" ADD CONSTRAINT "ReleaseEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseEvidence" ADD CONSTRAINT "ReleaseEvidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseEvidence" ADD CONSTRAINT "ReleaseEvidence_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "ScanJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseEvidence" ADD CONSTRAINT "ReleaseEvidence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
