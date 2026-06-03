/**
 * Test-only DB helpers. Importing this pulls in the Prisma client bound to the
 * test DATABASE_URL set by vitest.setup.ts.
 */
import { prisma } from "@/lib/db";
import { entitlementsForTier, leadCapForTier, type SubscriptionTier } from "@/lib/entitlements";
import { signUpBuilder } from "@/lib/onboarding";
import { createTenantScope, type TenantScope } from "@/lib/tenantScope";
import { captureContact, createDesignFromSite } from "@/lib/designService";

export { prisma };

/** Wipe all rows. Tenant deletes cascade to every tenant-owned table; platform
 * users (tenantId null) have no cascade parent, so clear users explicitly. */
export async function resetDb(): Promise<void> {
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
}

/** Create a tenant (cloned catalog + a builder_admin) and return its scope. */
export async function makeTenant(
  slug: string,
  opts: { tier?: SubscriptionTier; abandonedThresholdDays?: number } = {},
): Promise<TenantScope> {
  const res = await signUpBuilder({ email: `owner@${slug}.com`, tenantName: slug, slug });
  if ("error" in res) throw new Error(`signup failed: ${res.error}`);
  const data: Record<string, unknown> = {};
  if (opts.tier) {
    data.tier = opts.tier;
    data.entitlements = entitlementsForTier(opts.tier) as unknown as object;
    data.leadCap = leadCapForTier(opts.tier);
    data.subscriptionStatus = "active";
  }
  if (opts.abandonedThresholdDays != null) data.abandonedThresholdDays = opts.abandonedThresholdDays;
  if (Object.keys(data).length) await prisma.tenant.update({ where: { id: res.tenantId }, data });
  return createTenantScope(res.tenantId);
}

/** Seed a captured (status "started") lead with a design + first revision. */
export async function seedCapturedLead(
  scope: TenantScope,
  opts: { email?: string } = {},
): Promise<{ customerId: string; designId: string; revisionId: string; leadId: string }> {
  const customer = await scope.createAnonymousCustomer();
  const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE);
  if ("error" in created) throw new Error("draft_cap");
  await captureContact(scope, customer.id, created.design.id, opts.email ?? "buyer@example.com", true, "save_gate");
  const lead = await scope.findLeadByDesign(created.design.id);
  return { customerId: customer.id, designId: created.design.id, revisionId: created.revision.id, leadId: lead!.id };
}

/** A standard residential floating-dock site fixture. */
export const SAMPLE_SITE = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 2,
  bottom: "silt" as const,
  waveExposure: "inland_lake" as const,
  seasonalIce: true,
  shoreHeightAboveWaterFt: 3,
};
