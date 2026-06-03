/*
  Warnings:

  - You are about to drop the column `abandonedThresholdDays` on the `Lead` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Lead` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "abandonedThresholdDays",
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "quotedRevisionId" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Phase 3 backfill (handles a populated Lead table): seed lastActivityAt from
-- createdAt and set the state-machine status from submittedAt (§8 migration).
UPDATE "Lead" SET "lastActivityAt" = "createdAt";
UPDATE "Lead" SET "status" = CASE WHEN "submittedAt" IS NOT NULL THEN 'submitted' ELSE 'started' END;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "abandonedThresholdDays" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE INDEX "Notification_tenantId_read_idx" ON "Notification"("tenantId", "read");

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
