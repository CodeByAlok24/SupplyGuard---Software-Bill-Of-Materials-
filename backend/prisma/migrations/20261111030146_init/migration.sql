-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LicenseDecision" AS ENUM ('ALLOW', 'BLOCK', 'REVIEW');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'ANALYST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repositoryUrl" TEXT,
    "defaultBranch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "uploadName" TEXT NOT NULL,
    "options" JSONB,
    "lockfile" JSONB NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "componentCount" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityCount" INTEGER NOT NULL DEFAULT 0,
    "licenseReviewCount" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityCheckStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "vulnerabilityCheckError" TEXT,
    "licenseCheckStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "licenseCheckError" TEXT,
    "sbom" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "scanJobId" TEXT NOT NULL,
    "purl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "packageType" TEXT NOT NULL DEFAULT 'npm',
    "dependencyType" TEXT NOT NULL DEFAULT 'TRANSITIVE',
    "licenseExpression" TEXT,
    "licenseSource" TEXT,
    "licenseObservedAt" TIMESTAMP(3),

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyEdge" (
    "id" TEXT NOT NULL,
    "scanJobId" TEXT NOT NULL,
    "parentComponentId" TEXT NOT NULL,
    "childComponentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DependencyEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseFinding" (
    "id" TEXT NOT NULL,
    "scanJobId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "observedExpression" TEXT,
    "observationSource" TEXT,
    "decision" "LicenseDecision" NOT NULL DEFAULT 'REVIEW',
    "policyRule" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "LicenseFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VulnerabilityFinding" (
    "id" TEXT NOT NULL,
    "scanJobId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "osvId" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "summary" TEXT,
    "severity" TEXT,
    "cvssScore" DOUBLE PRECISION,
    "modifiedAt" TIMESTAMP(3),
    "affected" JSONB,

    CONSTRAINT "VulnerabilityFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicensePolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "licenseExpression" TEXT NOT NULL,
    "decision" "LicenseDecision" NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicensePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "licenseFindingId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "LicenseDecision" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scanJobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMember_workspaceId_role_idx" ON "WorkspaceMember"("workspaceId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_userId_workspaceId_key" ON "WorkspaceMember"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_updatedAt_idx" ON "Project"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_name_key" ON "Project"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ScanJob_workspaceId_createdAt_idx" ON "ScanJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanJob_projectId_createdAt_idx" ON "ScanJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanJob_status_createdAt_idx" ON "ScanJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Component_scanJobId_name_idx" ON "Component"("scanJobId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Component_scanJobId_purl_key" ON "Component"("scanJobId", "purl");

-- CreateIndex
CREATE INDEX "DependencyEdge_scanJobId_idx" ON "DependencyEdge"("scanJobId");

-- CreateIndex
CREATE UNIQUE INDEX "DependencyEdge_scanJobId_parentComponentId_childComponentId_key" ON "DependencyEdge"("scanJobId", "parentComponentId", "childComponentId");

-- CreateIndex
CREATE INDEX "LicenseFinding_scanJobId_decision_reviewStatus_idx" ON "LicenseFinding"("scanJobId", "decision", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseFinding_scanJobId_componentId_key" ON "LicenseFinding"("scanJobId", "componentId");

-- CreateIndex
CREATE INDEX "VulnerabilityFinding_scanJobId_severity_idx" ON "VulnerabilityFinding"("scanJobId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "VulnerabilityFinding_scanJobId_componentId_osvId_key" ON "VulnerabilityFinding"("scanJobId", "componentId", "osvId");

-- CreateIndex
CREATE UNIQUE INDEX "LicensePolicy_workspaceId_licenseExpression_key" ON "LicensePolicy"("workspaceId", "licenseExpression");

-- CreateIndex
CREATE INDEX "ReviewDecision_licenseFindingId_createdAt_idx" ON "ReviewDecision"("licenseFindingId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_workspaceId_createdAt_idx" ON "Report"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanJob" ADD CONSTRAINT "ScanJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanJob" ADD CONSTRAINT "ScanJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "ScanJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyEdge" ADD CONSTRAINT "DependencyEdge_parentComponentId_fkey" FOREIGN KEY ("parentComponentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyEdge" ADD CONSTRAINT "DependencyEdge_childComponentId_fkey" FOREIGN KEY ("childComponentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseFinding" ADD CONSTRAINT "LicenseFinding_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "ScanJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseFinding" ADD CONSTRAINT "LicenseFinding_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VulnerabilityFinding" ADD CONSTRAINT "VulnerabilityFinding_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "ScanJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VulnerabilityFinding" ADD CONSTRAINT "VulnerabilityFinding_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicensePolicy" ADD CONSTRAINT "LicensePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_licenseFindingId_fkey" FOREIGN KEY ("licenseFindingId") REFERENCES "LicenseFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "ScanJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
