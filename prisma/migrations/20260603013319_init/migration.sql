-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('starter', 'pro', 'premium');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('platform_admin', 'builder_admin', 'builder_member');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'starter',
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "trialEndsAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "entitlements" JSONB NOT NULL,
    "leadCap" INTEGER,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branding" (
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoText" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "removeBadge" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Branding_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "PricingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dockType" TEXT NOT NULL,
    "priceVisibility" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "labor" JSONB,
    "deliveryBands" JSONB,
    "minimumPrice" DOUBLE PRECISION,
    "markupPct" DOUBLE PRECISION,

    CONSTRAINT "PricingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PricingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloatProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "ratedBuoyancyLbs" DOUBLE PRECISION NOT NULL,
    "lengthIn" DOUBLE PRECISION NOT NULL,
    "widthIn" DOUBLE PRECISION NOT NULL,
    "heightIn" DOUBLE PRECISION NOT NULL,
    "sealedShell" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FloatProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckingProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "upchargePerFt2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeckingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessoryProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AccessoryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "savedShoreline" JSONB,
    "consent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentRevisionId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "estimateSnapshot" JSONB,
    "authorRole" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerContact" JSONB NOT NULL,
    "consent" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "abandonedThresholdDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeCustomerId_key" ON "Tenant"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeSubscriptionId_key" ON "Tenant"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "PricingProfile_tenantId_idx" ON "PricingProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingProfile_tenantId_dockType_key" ON "PricingProfile"("tenantId", "dockType");

-- CreateIndex
CREATE INDEX "PricingItem_profileId_idx" ON "PricingItem"("profileId");

-- CreateIndex
CREATE INDEX "PricingItem_tenantId_idx" ON "PricingItem"("tenantId");

-- CreateIndex
CREATE INDEX "FloatProduct_tenantId_idx" ON "FloatProduct"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FloatProduct_tenantId_sku_key" ON "FloatProduct"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "DeckingProduct_tenantId_idx" ON "DeckingProduct"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DeckingProduct_tenantId_material_key" ON "DeckingProduct"("tenantId", "material");

-- CreateIndex
CREATE INDEX "AccessoryProduct_tenantId_idx" ON "AccessoryProduct"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessoryProduct_tenantId_type_key" ON "AccessoryProduct"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_email_idx" ON "Customer"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Design_tenantId_idx" ON "Design"("tenantId");

-- CreateIndex
CREATE INDEX "Design_tenantId_customerId_idx" ON "Design"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Revision_tenantId_idx" ON "Revision"("tenantId");

-- CreateIndex
CREATE INDEX "Revision_designId_idx" ON "Revision"("designId");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_designId_version_key" ON "Revision"("designId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_designId_key" ON "Lead"("designId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branding" ADD CONSTRAINT "Branding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingProfile" ADD CONSTRAINT "PricingProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingItem" ADD CONSTRAINT "PricingItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingItem" ADD CONSTRAINT "PricingItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PricingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloatProduct" ADD CONSTRAINT "FloatProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckingProduct" ADD CONSTRAINT "DeckingProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryProduct" ADD CONSTRAINT "AccessoryProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
