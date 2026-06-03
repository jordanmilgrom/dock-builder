-- DropIndex
DROP INDEX "PricingProfile_tenantId_dockType_key";

-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "pricingProfileId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PricingProfile" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Default';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "customDomainTxtToken" TEXT,
ADD COLUMN     "customDomainVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'builder_member',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Template_tenantId_idx" ON "Template"("tenantId");

-- CreateIndex
CREATE INDEX "Event_tenantId_kind_at_idx" ON "Event"("tenantId", "kind", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_idx" ON "Invitation"("tenantId");

-- CreateIndex
CREATE INDEX "PricingProfile_tenantId_dockType_idx" ON "PricingProfile"("tenantId", "dockType");

-- CreateIndex
CREATE UNIQUE INDEX "PricingProfile_tenantId_name_dockType_key" ON "PricingProfile"("tenantId", "name", "dockType");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_customDomain_key" ON "Tenant"("customDomain");

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "PricingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Phase 4 backfill: the pre-existing per-dockType profiles are the default set.
UPDATE "PricingProfile" SET "isDefault" = true WHERE "name" = 'Default';
