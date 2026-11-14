-- AlterTable
ALTER TABLE "ScanJob" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "repositoryUrl" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'upload',
ALTER COLUMN "uploadName" DROP NOT NULL,
ALTER COLUMN "lockfile" DROP NOT NULL;
