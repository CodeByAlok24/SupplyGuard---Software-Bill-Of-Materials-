-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetTokenExpires" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;
