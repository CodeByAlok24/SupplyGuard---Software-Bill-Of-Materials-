-- CreateTable
CREATE TABLE "ProvenanceAttestation" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "envelope" TEXT NOT NULL,
    "predicateType" TEXT NOT NULL,
    "statementType" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "rawBytes" INTEGER NOT NULL,
    "fileName" TEXT,
    "subjectName" TEXT,
    "subjectDigest" TEXT,
    "subjectCount" INTEGER NOT NULL DEFAULT 1,
    "subjects" JSONB,
    "subjectMatchesArtifact" BOOLEAN,
    "builderId" TEXT,
    "buildType" TEXT,
    "buildInvocationId" TEXT,
    "startedOn" TIMESTAMP(3),
    "finishedOn" TIMESTAMP(3),
    "sourceRepoUrl" TEXT,
    "sourceRevision" TEXT,
    "materials" JSONB,
    "signatureCount" INTEGER NOT NULL DEFAULT 0,
    "signatureState" TEXT NOT NULL DEFAULT 'unverified',
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ProvenanceAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProvenanceAttestation_evidenceId_key" ON "ProvenanceAttestation"("evidenceId");

-- CreateIndex
CREATE INDEX "ProvenanceAttestation_workspaceId_parsedAt_idx" ON "ProvenanceAttestation"("workspaceId", "parsedAt");

-- AddForeignKey
ALTER TABLE "ProvenanceAttestation" ADD CONSTRAINT "ProvenanceAttestation_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ReleaseEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceAttestation" ADD CONSTRAINT "ProvenanceAttestation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceAttestation" ADD CONSTRAINT "ProvenanceAttestation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
