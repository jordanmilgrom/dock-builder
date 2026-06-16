import "server-only";
/**
 * The acme-docks migration (§8 migration). Reproduces the Phase 1 single dev
 * tenant — same branding/catalog/pricing the dev fixtures used — as real
 * Postgres rows under tenantId "acme-docks", plus a real builder_admin user
 * (the former hardcoded dev login) and an optional platform_admin.
 *
 * Idempotent: safe to run repeatedly from the Prisma seed script.
 */

import { generateStartingDesign, migrateConfigToPhase9, type DockConfig } from "@/engine";
import { prisma } from "./db.js";
import { entitlementsForTier, leadCapForTier } from "./entitlements.js";
import { signUpBuilder } from "./onboarding.js";
import { ACME_BRAND, ACME_SLUG, ACME_TENANT_ID } from "./seed.js";
import { createTenantScope } from "./tenantScope.js";
import { WEBHOOK_EVENT_KINDS } from "./webhooks.js";

export const ACME_ADMIN_EMAIL = process.env.ACME_ADMIN_EMAIL ?? "owner@acme-docks.test";
export const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "admin@dockconfigurator.test";

const STARTER_TEMPLATE_NAME = "Starter floating dock";
const HYBRID_TEMPLATE_NAME = "Acme hybrid dock";
export const SEEDED_WEBHOOK_URL = "https://example.test/dock-events";

export async function seedAcme(): Promise<string> {
  const existing = await prisma.tenant.findUnique({ where: { id: ACME_TENANT_ID } });
  if (!existing) {
    const res = await signUpBuilder(
      {
        email: ACME_ADMIN_EMAIL,
        tenantName: ACME_BRAND.name,
        slug: ACME_SLUG,
        brand: {
          logoText: ACME_BRAND.logoText,
          primaryColor: ACME_BRAND.primaryColor,
          secondaryColor: ACME_BRAND.secondaryColor,
        },
      },
      { tenantId: ACME_TENANT_ID },
    );
    if ("error" in res) throw new Error(`acme seed failed: ${res.error}`);
  }

  // Phase 4: upgrade acme to Premium in dev so all features are exercised E2E.
  await prisma.tenant.update({
    where: { id: ACME_TENANT_ID },
    data: {
      tier: "premium",
      subscriptionStatus: "active",
      entitlements: entitlementsForTier("premium") as unknown as object,
      leadCap: leadCapForTier("premium"),
    },
  });
  // Premium → turn the white-label badge toggle on so the badge is actually
  // hidden across the hosted page + embed (both entitlement AND branding gate).
  await prisma.branding.update({ where: { tenantId: ACME_TENANT_ID }, data: { removeBadge: true } });

  // Seed a single starter template (idempotent).
  const scope = createTenantScope(ACME_TENANT_ID);
  const hasTemplate = (await scope.listTemplates()).some((t) => t.name === STARTER_TEMPLATE_NAME);
  if (!hasTemplate) {
    const config = generateStartingDesign(
      {
        depthAtEndLowWaterFt: 6,
        seasonalFluctuationFt: 2,
        bottom: "silt",
        waveExposure: "inland_lake",
        seasonalIce: true,
        shoreHeightAboveWaterFt: 3,
      },
      { tenantId: ACME_TENANT_ID, dockType: "floating" },
    );
    // Phase 8: stamp the single starter piece with construction = "floating".
    await scope.createTemplate({ name: STARTER_TEMPLATE_NAME, config: migrateConfigToPhase9(config), createdBy: "seed" });
  }

  // Phase 8: a hybrid template (floating + pile rectangle joined by a triangle
  // connector) so the per-piece-construction path has a ready example.
  const hasHybrid = (await scope.listTemplates()).some((t) => t.name === HYBRID_TEMPLATE_NAME);
  if (!hasHybrid) {
    const base = generateStartingDesign(
      { depthAtEndLowWaterFt: 5, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: true, shoreHeightAboveWaterFt: 3 },
      { tenantId: ACME_TENANT_ID, dockType: "floating" },
    );
    const hybrid: DockConfig = {
      ...base,
      overall: { ...base.overall, lengthFt: 40, widthFt: 8, maxGapFt: 8 },
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, constructions: ["floating"] },
        { pieceKind: "right_triangle", posX: 20, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 8, constructions: ["pile"] },
        { pieceKind: "rectangle", posX: 24, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8, constructions: ["pile"] },
      ],
    };
    await scope.createTemplate({ name: HYBRID_TEMPLATE_NAME, config: hybrid, createdBy: "seed" });
  }

  // Phase 5: seed one webhook endpoint so the jobs flow has somewhere to fire
  // (mocked in tests). Idempotent.
  const endpoints = await scope.listWebhookEndpoints();
  if (!endpoints.some((e) => e.url === SEEDED_WEBHOOK_URL)) {
    await scope.createWebhookEndpoint({
      url: SEEDED_WEBHOOK_URL,
      secret: "whsec_acme_seed_secret",
      eventKinds: [...WEBHOOK_EVENT_KINDS],
    });
  }
  return ACME_TENANT_ID;
}

/** Ensure a platform_admin exists for the /admin surface. */
export async function seedPlatformAdmin(email = PLATFORM_ADMIN_EMAIL): Promise<void> {
  const lower = email.toLowerCase();
  const existing = await prisma.user.findFirst({ where: { role: "platform_admin", email: lower } });
  if (!existing) await prisma.user.create({ data: { email: lower, role: "platform_admin", tenantId: null } });
}
