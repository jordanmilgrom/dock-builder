import "server-only";
/**
 * The acme-docks migration (§8 migration). Reproduces the Phase 1 single dev
 * tenant — same branding/catalog/pricing the dev fixtures used — as real
 * Postgres rows under tenantId "acme-docks", plus a real builder_admin user
 * (the former hardcoded dev login) and an optional platform_admin.
 *
 * Idempotent: safe to run repeatedly from the Prisma seed script.
 */

import { generateStartingDesign } from "@/engine";
import { prisma } from "./db.js";
import { entitlementsForTier, leadCapForTier } from "./entitlements.js";
import { signUpBuilder } from "./onboarding.js";
import { ACME_BRAND, ACME_SLUG, ACME_TENANT_ID } from "./seed.js";
import { createTenantScope } from "./tenantScope.js";
import { WEBHOOK_EVENT_KINDS } from "./webhooks.js";

export const ACME_ADMIN_EMAIL = process.env.ACME_ADMIN_EMAIL ?? "owner@acme-docks.test";
export const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "admin@dockconfigurator.test";

const STARTER_TEMPLATE_NAME = "Starter floating dock";
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
    await scope.createTemplate({ name: STARTER_TEMPLATE_NAME, config, createdBy: "seed" });
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
