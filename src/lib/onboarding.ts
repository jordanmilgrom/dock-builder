import "server-only";
/**
 * Builder self-serve onboarding (§5.2, §8 Phase 2 item 4):
 *   sign up → create tenant → clone the default catalog → start a 14-day trial.
 *
 * A valid Stripe-billed subscription is the trust signal (§10 #5): no manual
 * "verified" flag, no business license. The tenant starts in `trialing` with
 * Starter entitlements; upgrading happens via Stripe Checkout + the webhook.
 *
 * DB-only and network-free so the happy path is unit-testable (lib/onboarding.test.ts).
 */

import { prisma } from "./db.js";
import { entitlementsForTier, leadCapForTier } from "./entitlements.js";
import { defaultCatalog, type BrandIdentity } from "./seed.js";
import { TRIAL_DAYS } from "./stripe.js";
import { isValidSlug, RESERVED_SUBDOMAINS } from "./tenantRouting.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface SignupInput {
  email: string;
  tenantName: string;
  slug: string;
  /** Optional branding overrides; name comes from tenantName. */
  brand?: Partial<Pick<BrandIdentity, "logoText" | "primaryColor" | "secondaryColor">>;
}

export type SignupError = "invalid_email" | "invalid_slug" | "reserved_slug" | "slug_taken";

export interface SignupResult {
  tenantId: string;
  slug: string;
  userId: string;
  trialEndsAt: string;
}

/**
 * Create a tenant + builder_admin user + cloned catalog in one transaction.
 * Provide `opts.tenantId` to force a human-readable id (the acme-docks migration);
 * otherwise a generated id is used so the mutable slug never becomes the PK.
 */
export async function signUpBuilder(
  input: SignupInput,
  opts: { tenantId?: string; now?: Date } = {},
): Promise<SignupResult | { error: SignupError }> {
  const email = input.email?.trim().toLowerCase();
  const slug = input.slug?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return { error: "invalid_email" };
  if (!slug || !isValidSlug(slug)) return { error: "invalid_slug" };
  if (RESERVED_SUBDOMAINS.has(slug)) return { error: "reserved_slug" };

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) return { error: "slug_taken" };

  const now = opts.now ?? new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const tenantId = opts.tenantId ?? `t_${crypto.randomUUID()}`;

  const brand: BrandIdentity = {
    name: input.tenantName,
    logoText: input.brand?.logoText ?? input.tenantName.toUpperCase(),
    primaryColor: input.brand?.primaryColor ?? "#0e7490",
    secondaryColor: input.brand?.secondaryColor ?? "#0f172a",
  };
  const catalog = defaultCatalog(brand);

  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      slug,
      name: input.tenantName,
      tier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt,
      entitlements: entitlementsForTier("starter") as unknown as object,
      leadCap: leadCapForTier("starter"),
      branding: {
        create: {
          name: catalog.branding.name,
          logoText: catalog.branding.logoText,
          primaryColor: catalog.branding.primaryColor,
          secondaryColor: catalog.branding.secondaryColor,
          removeBadge: catalog.branding.removeBadge,
        },
      },
      pricingProfiles: {
        create: catalog.pricingProfiles.map((p) => ({
          dockType: p.dockType,
          priceVisibility: p.priceVisibility,
          currency: p.currency,
          labor: p.labor as unknown as object,
          deliveryBands: p.deliveryBands as unknown as object,
          minimumPrice: p.minimumPrice,
          markupPct: p.markupPct,
          items: { create: p.items.map((it) => ({ key: it.key, unit: it.unit, unitPrice: it.unitPrice, ...(it.label ? { label: it.label } : {}) })) },
        })),
      },
      floatProducts: { create: catalog.floatProducts.map((f) => ({ ...f })) },
      deckingProducts: { create: catalog.deckingProducts.map((d) => ({ ...d })) },
      accessoryProducts: { create: catalog.accessoryProducts.map((a) => ({ ...a })) },
      users: { create: { email, role: "builder_admin" } },
    },
    include: { users: true },
  });

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    userId: tenant.users[0]!.id,
    trialEndsAt: trialEndsAt.toISOString(),
  };
}
