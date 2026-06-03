import "server-only";
/**
 * The acme-docks migration (§8 migration). Reproduces the Phase 1 single dev
 * tenant — same branding/catalog/pricing the dev fixtures used — as real
 * Postgres rows under tenantId "acme-docks", plus a real builder_admin user
 * (the former hardcoded dev login) and an optional platform_admin.
 *
 * Idempotent: safe to run repeatedly from the Prisma seed script.
 */

import { prisma } from "./db.js";
import { signUpBuilder } from "./onboarding.js";
import { ACME_BRAND, ACME_SLUG, ACME_TENANT_ID } from "./seed.js";

export const ACME_ADMIN_EMAIL = process.env.ACME_ADMIN_EMAIL ?? "owner@acme-docks.test";
export const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "admin@dockconfigurator.test";

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
  return ACME_TENANT_ID;
}

/** Ensure a platform_admin exists for the /admin surface. */
export async function seedPlatformAdmin(email = PLATFORM_ADMIN_EMAIL): Promise<void> {
  const lower = email.toLowerCase();
  const existing = await prisma.user.findFirst({ where: { role: "platform_admin", email: lower } });
  if (!existing) await prisma.user.create({ data: { email: lower, role: "platform_admin", tenantId: null } });
}
